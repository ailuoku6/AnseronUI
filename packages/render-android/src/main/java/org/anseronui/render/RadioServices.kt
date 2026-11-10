package org.anseronui.render

import android.Manifest
import android.app.Activity
import android.bluetooth.*
import android.bluetooth.le.*
import android.content.Context
import android.content.pm.PackageManager
import android.nfc.*
import android.nfc.tech.Ndef
import android.os.*
import org.json.*
import java.util.UUID

internal class RadioServices(private val context: Context, private val activity: () -> Activity?, private val fragment: () -> ServiceResultFragment) {
    private val ui = Handler(Looper.getMainLooper())
    private val manager get() = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
    private val adapter get() = manager?.adapter
    private val devices = mutableMapOf<String, BluetoothDevice>()
    private val connections = mutableMapOf<String, BluetoothGatt>()
    private var pending: NativeCompletion? = null
    private var operation = ""
    private var targetGatt: BluetoothGatt? = null
    private var targetCharacteristic: BluetoothGattCharacteristic? = null
    private var timeout: Runnable? = null
    private var scan: ScanCallback? = null
    private var scanEnd: Runnable? = null
    private var scanFinish: (() -> Unit)? = null
    private var permissionCancel: (() -> Unit)? = null
    private val listeners = mutableSetOf<(Any?) -> Unit>()
    private var nfcCompletion: NativeCompletion? = null
    private var nfcTimer: Runnable? = null
    fun methods(module: String): List<String> = when {
        module == "bluetooth" && context.packageManager.hasSystemFeature(PackageManager.FEATURE_BLUETOOTH_LE) -> listOf("scan", "connect", "disconnect", "getServices", "read", "write", "setNotify", "subscribe")
        module == "nfc" && NfcAdapter.getDefaultAdapter(context) != null -> listOf("read", "writeText")
        else -> emptyList()
    }
    fun listen(callback: (Any?) -> Unit): () -> Unit { listeners.add(callback); return { listeners.remove(callback); Unit } }
    private fun fail(message: String) { finish(Result.failure(IllegalStateException(message))) }
    private fun finish(result: Result<Any?>) {
        timeout?.let { ui.removeCallbacks(it) }; timeout = null; stopScan(); permissionCancel?.invoke(); permissionCancel = null
        val callback = pending; pending = null; operation = ""; targetGatt = null; targetCharacteristic = null; callback?.invoke(result)
    }
    private fun stopScan() { scan?.let { runCatching { adapter?.bluetoothLeScanner?.stopScan(it) } }; scan = null; scanEnd?.let { ui.removeCallbacks(it) }; scanEnd = null; scanFinish = null }
    private fun names() = if (Build.VERSION.SDK_INT >= 31) arrayOf(Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT) else arrayOf(Manifest.permission.ACCESS_FINE_LOCATION)
    private fun granted() = names().all { context.checkSelfPermission(it) == PackageManager.PERMISSION_GRANTED }
    private fun uuid(value: String): UUID {
        val full = when(value.length) { 4 -> "0000$value-0000-1000-8000-00805f9b34fb"; 8 -> "$value-0000-1000-8000-00805f9b34fb"; else -> value }
        return try { UUID.fromString(full) } catch (_: Throwable) { throw IllegalArgumentException("INVALID_ARGUMENT: UUID") }
    }
    fun invoke(module: String, method: String, args: JSONObject, complete: NativeCompletion): (() -> Unit)? {
        if (module == "nfc") return nfc(method, args, complete)
        check(pending == null) { "INVALID_ARGUMENT: Bluetooth operation busy" }
        val bluetooth = adapter ?: throw IllegalStateException("UNSUPPORTED: Bluetooth hardware")
        val filters = if (method == "scan") args.getJSONArray("serviceUUIDs").let { values -> (0 until values.length()).map { ScanFilter.Builder().setServiceUuid(ParcelUuid(uuid(values.getString(it)))).build() } } else emptyList()
        val duration = args.optLong("durationMs", 5000); require(method != "scan" || duration in 500..30000) { "INVALID_ARGUMENT: durationMs" }
        if (method != "scan" && !granted()) throw IllegalStateException("PERMISSION_DENIED: scan to request Bluetooth permissions first")
        pending = complete; operation = method
        val begin = {
            try {
                check(bluetooth.isEnabled) { "UNSUPPORTED: Bluetooth powered off" }
                if (method == "scan") {
                    val found = mutableMapOf<String, JSONObject>()
                    val callback = object : ScanCallback() {
                        override fun onScanResult(type: Int, result: ScanResult) { ui.post { if (scan === this) { devices[result.device.address] = result.device; found[result.device.address] = JSONObject().put("id", result.device.address).put("name", result.device.name ?: result.scanRecord?.deviceName ?: "").put("rssi", result.rssi) } } }
                        override fun onBatchScanResults(results: MutableList<ScanResult>) { results.forEach { onScanResult(0, it) } }
                        override fun onScanFailed(code: Int) { ui.post { if (scan === this) fail("IO_ERROR: scan $code") } }
                    }
                    scan = callback; scanFinish = { finish(Result.success(JSONArray(found.values.toList()))) }
                    bluetooth.bluetoothLeScanner.startScan(filters, ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build(), callback)
                    val end = Runnable { scanFinish?.invoke() }; scanEnd = end; ui.postDelayed(end, duration)
                } else {
                    val id = args.getString("deviceId")
                    if (method == "connect") {
                        val device = devices[id] ?: throw IllegalArgumentException("INVALID_ARGUMENT: deviceId (scan first)")
                        connections.remove(id)?.let { it.disconnect(); it.close() }
                        val gatt = device.connectGatt(context, false, callback, BluetoothDevice.TRANSPORT_LE, BluetoothDevice.PHY_LE_1M_MASK, ui)
                        connections[id] = gatt; targetGatt = gatt
                    } else {
                        val gatt = connections[id] ?: throw IllegalArgumentException("INVALID_ARGUMENT: disconnected device")
                        targetGatt = gatt
                        if (method == "disconnect") { connections.remove(id); gatt.disconnect(); gatt.close(); finish(Result.success(null)) }
                        else if (method == "getServices") { check(gatt.discoverServices()) { "IO_ERROR: discover services" } }
                        else {
                            val characteristic = gatt.getService(uuid(args.getString("service")))?.getCharacteristic(uuid(args.getString("characteristic"))) ?: throw IllegalArgumentException("INVALID_ARGUMENT: characteristic (getServices first)")
                            targetCharacteristic = characteristic
                            when(method) {
                                "read" -> check(gatt.readCharacteristic(characteristic)) { "IO_ERROR: read" }
                                "write" -> {
                                    val values = args.getJSONArray("value"); require(values.length() <= 20) { "INVALID_ARGUMENT: maximum 20 bytes (default ATT MTU)" }
                                    val bytes = ByteArray(values.length()) { val numeric = values.getDouble(it); val value = numeric.toInt(); require(numeric == value.toDouble() && value in 0..255) { "INVALID_ARGUMENT: byte" }; value.toByte() }
                                    require(characteristic.properties and BluetoothGattCharacteristic.PROPERTY_WRITE != 0) { "UNSUPPORTED: write with response" }
                                    characteristic.writeType = BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT; characteristic.value = bytes
                                    check(gatt.writeCharacteristic(characteristic)) { "IO_ERROR: write" }
                                }
                                "setNotify" -> {
                                    val enabled = args.getBoolean("enabled"); check(gatt.setCharacteristicNotification(characteristic, enabled)) { "IO_ERROR: notify" }
                                    val descriptor = characteristic.getDescriptor(uuid("2902")) ?: throw IllegalArgumentException("UNSUPPORTED: CCC descriptor")
                                    descriptor.value = if (!enabled) BluetoothGattDescriptor.DISABLE_NOTIFICATION_VALUE else if (characteristic.properties and BluetoothGattCharacteristic.PROPERTY_NOTIFY != 0) BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE else BluetoothGattDescriptor.ENABLE_INDICATION_VALUE
                                    check(gatt.writeDescriptor(descriptor)) { "IO_ERROR: CCC write" }
                                }
                                else -> throw IllegalStateException("UNSUPPORTED")
                            }
                        }
                    }
                }
            } catch (error: Throwable) { finish(Result.failure(error)) }
        }
        val limit = Runnable { val gatt = targetGatt; gatt?.let { connections.remove(it.device.address); it.disconnect(); it.close() }; fail("TIMEOUT: Bluetooth") }; timeout = limit; ui.postDelayed(limit, 35000)
        if (granted()) begin() else permissionCancel = fragment().permission(names()) { if (granted()) begin() else fail("PERMISSION_DENIED: Bluetooth") }
        return { val gatt = targetGatt; gatt?.let { connections.remove(it.device.address); it.disconnect(); it.close() }; finish(Result.failure(IllegalStateException("CANCELLED"))) }
    }
    private val callback = object : BluetoothGattCallback() {
        override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, state: Int) { ui.post {
            if (connections[gatt.device.address] !== gatt) return@post
            if (state == BluetoothProfile.STATE_DISCONNECTED || status != BluetoothGatt.GATT_SUCCESS) { connections.remove(gatt.device.address); gatt.close(); if (targetGatt === gatt) fail("IO_ERROR: disconnected ($status)") }
            else if (state == BluetoothProfile.STATE_CONNECTED && operation == "connect" && targetGatt === gatt) finish(Result.success(null))
        } }
        override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) { ui.post {
            if (operation != "getServices" || targetGatt !== gatt) return@post
            if (status != 0) { fail("IO_ERROR: discovery $status"); return@post }
            val result = JSONArray(); gatt.services.forEach { service -> service.characteristics.forEach { item -> result.put(JSONObject().put("service", service.uuid.toString()).put("characteristic", item.uuid.toString()).put("readable", item.properties and BluetoothGattCharacteristic.PROPERTY_READ != 0).put("writable", item.properties and BluetoothGattCharacteristic.PROPERTY_WRITE != 0).put("notifiable", item.properties and (BluetoothGattCharacteristic.PROPERTY_NOTIFY or BluetoothGattCharacteristic.PROPERTY_INDICATE) != 0)) } }; finish(Result.success(result))
        } }
        override fun onCharacteristicRead(gatt: BluetoothGatt, item: BluetoothGattCharacteristic, status: Int) { val bytes = item.value?.map { it.toInt() and 255 } ?: emptyList(); ui.post { if (operation == "read" && targetGatt === gatt && targetCharacteristic === item) { if (status == 0) finish(Result.success(JSONArray(bytes))) else fail("IO_ERROR: read $status") } } }
        override fun onCharacteristicWrite(gatt: BluetoothGatt, item: BluetoothGattCharacteristic, status: Int) { ui.post { if (operation == "write" && targetGatt === gatt && targetCharacteristic === item) { if (status == 0) finish(Result.success(null)) else fail("IO_ERROR: write $status") } } }
        override fun onDescriptorWrite(gatt: BluetoothGatt, descriptor: BluetoothGattDescriptor, status: Int) { ui.post { if (operation == "setNotify" && targetGatt === gatt && targetCharacteristic === descriptor.characteristic) { if (status == 0) finish(Result.success(null)) else fail("IO_ERROR: notify $status") } } }
        override fun onCharacteristicChanged(gatt: BluetoothGatt, item: BluetoothGattCharacteristic) { val bytes = item.value?.map { it.toInt() and 255 } ?: emptyList(); ui.post { if (connections[gatt.device.address] === gatt) listeners.toList().forEach { it(JSONObject().put("deviceId", gatt.device.address).put("service", item.service.uuid.toString()).put("characteristic", item.uuid.toString()).put("value", JSONArray(bytes))) } } }
    }
    private fun endNFC(result: Result<Any?>) { nfcTimer?.let { ui.removeCallbacks(it) }; nfcTimer = null; activity()?.let { NfcAdapter.getDefaultAdapter(context)?.disableReaderMode(it) }; val done = nfcCompletion; nfcCompletion = null; done?.invoke(result) }
    private fun nfc(method: String, args: JSONObject, complete: NativeCompletion): () -> Unit {
        check(nfcCompletion == null) { "INVALID_ARGUMENT: NFC busy" }
        val adapter = NfcAdapter.getDefaultAdapter(context) ?: throw IllegalStateException("UNSUPPORTED: NFC")
        check(adapter.isEnabled) { "UNSUPPORTED: enable NFC in settings" }; val host = activity() ?: throw IllegalStateException("UNSUPPORTED: Activity required")
        val text = if (method == "writeText") args.getString("text") else null; nfcCompletion = complete
        val session = complete
        adapter.enableReaderMode(host, { tag ->
            val result = runCatching<Any?> {
                val ndef = Ndef.get(tag) ?: throw IllegalStateException("UNSUPPORTED: NDEF tag")
                ndef.use { value ->
                    value.connect()
                    if (text != null) { check(value.isWritable) { "PERMISSION_DENIED: read-only tag" }; val message = NdefMessage(arrayOf(NdefRecord.createTextRecord("en", text))); require(message.toByteArray().size <= value.maxSize) { "INVALID_ARGUMENT: NFC capacity" }; value.writeNdefMessage(message); null }
                    else {
                        val records = JSONArray(); (value.ndefMessage?.records ?: emptyArray()).forEach { record ->
                            val payload = record.payload
                            val isText = record.tnf == NdefRecord.TNF_WELL_KNOWN && record.type.contentEquals(NdefRecord.RTD_TEXT)
                            val uri = record.toUri()
                            val content = if (isText && payload.isNotEmpty()) { val language = payload[0].toInt() and 63; require(payload.size >= language + 1) { "IO_ERROR: malformed NDEF text" }; String(payload, language + 1, payload.size - language - 1, if (payload[0].toInt() and 128 != 0) Charsets.UTF_16 else Charsets.UTF_8) } else uri?.toString() ?: android.util.Base64.encodeToString(payload, android.util.Base64.NO_WRAP)
                            records.put(JSONObject().put("type", if (isText) "text" else if (uri != null) "url" else String(record.type, Charsets.UTF_8)).put("text", content))
                        }; JSONObject().put("records", records)
                    }
                }
            }; ui.post { if (nfcCompletion === session) endNFC(result) }
        }, NfcAdapter.FLAG_READER_NFC_A or NfcAdapter.FLAG_READER_NFC_B or NfcAdapter.FLAG_READER_NFC_F or NfcAdapter.FLAG_READER_NFC_V, null)
        val timer = Runnable { if (nfcCompletion === session) endNFC(Result.failure(IllegalStateException("TIMEOUT: NFC"))) }; nfcTimer = timer; ui.postDelayed(timer, 30000)
        return { if (nfcCompletion === session) endNFC(Result.failure(IllegalStateException("CANCELLED"))) }
    }
    fun dispose() { pending = null; stopScan(); timeout?.let { ui.removeCallbacks(it) }; permissionCancel?.invoke(); permissionCancel = null; connections.values.forEach { runCatching { it.disconnect(); it.close() } }; connections.clear(); listeners.clear(); endNFC(Result.failure(IllegalStateException("CANCELLED"))) }
}
