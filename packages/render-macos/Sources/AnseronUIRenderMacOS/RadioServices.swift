import Foundation
import CoreBluetooth
#if os(iOS)
import CoreNFC
#endif

private struct RadioFailure: LocalizedError, CustomStringConvertible { var description: String { errorDescription ?? "IO_ERROR" }; let errorDescription: String?; init(_ value: String) { errorDescription = value } }
/** One outstanding GATT operation per page; all callbacks run on the main queue. */
@MainActor final class RadioServices: NSObject, CBCentralManagerDelegate, CBPeripheralDelegate {
    private var central: CBCentralManager!
    private var devices: [String: CBPeripheral] = [:]
    private var found: [String: [String: Any]] = [:]
    private var pending: NativeCompletion?
    private var operation = ""
    private var activePeripheral: CBPeripheral?
    private var target: CBCharacteristic?
    private var timer: DispatchWorkItem?
    private var scanTimer: DispatchWorkItem?
    private var listeners: [UUID: (Any) -> Void] = [:]
    #if os(iOS)
    private var nfc: NDEFSession?
    #endif
    func methods(_ module: String) -> [String] {
        if module == "bluetooth" { return ["scan", "connect", "disconnect", "getServices", "read", "write", "setNotify", "subscribe"] }
        #if os(iOS)
        if module == "nfc", NFCNDEFReaderSession.readingAvailable { return ["read", "writeText"] }
        #endif
        return []
    }
    func listen(_ callback: @escaping (Any) -> Void) -> () -> Void { let id = UUID(); listeners[id] = callback; return { [weak self] in self?.listeners.removeValue(forKey: id) } }
    private func finish(_ result: Result<Any, Error>) { let callback = pending; pending = nil; operation = ""; target = nil; activePeripheral = nil; timer?.cancel(); timer = nil; scanTimer?.cancel(); scanTimer = nil; callback?(result) }
    private func fail(_ message: String) { let device = activePeripheral; finish(.failure(RadioFailure(message))); if let device { central?.cancelPeripheralConnection(device) } }
    private func manager() -> CBCentralManager { if central == nil { central = CBCentralManager(delegate: self, queue: .main) }; return central }
    private func startScan(_ args: [String: Any]) throws -> () -> Void {
        guard let uuids = args["serviceUUIDs"] as? [String], uuids.allSatisfy(validUUID) else { throw RadioFailure("INVALID_ARGUMENT: serviceUUIDs") }
        let duration = (args["durationMs"] as? NSNumber)?.doubleValue ?? 5000
        guard duration >= 500, duration <= 30000 else { throw RadioFailure("INVALID_ARGUMENT: durationMs (500..30000)") }
        found.removeAll()
        let begin = { [weak self] in
            guard let self else { return }; self.central.scanForPeripherals(withServices: uuids.isEmpty ? nil : uuids.map { CBUUID(string: $0) })
            let end = DispatchWorkItem { [weak self] in guard let self else { return }; self.central.stopScan(); self.finish(.success(self.found.values.sorted { ($0["id"] as? String ?? "") < ($1["id"] as? String ?? "") })) }
            self.scanTimer = end; DispatchQueue.main.asyncAfter(deadline: .now() + duration / 1000, execute: end)
        }
        return begin
    }
    private var ready: (() -> Void)?
    private func validUUID(_ value: String) -> Bool { value.range(of: "^([0-9a-fA-F]{4}|[0-9a-fA-F]{8}|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$", options: .regularExpression) != nil }
    func invoke(_ module: String, _ method: String, _ args: [String: Any], _ complete: @escaping NativeCompletion) throws -> (() -> Void)? {
        #if os(iOS)
        if module == "nfc" {
            guard Bundle.main.object(forInfoDictionaryKey: "NFCReaderUsageDescription") is String else { throw RadioFailure("UNSUPPORTED: NFCReaderUsageDescription missing") }
            guard nfc == nil else { throw RadioFailure("INVALID_ARGUMENT: NFC session busy") }
            if method == "writeText", !(args["text"] is String) { throw RadioFailure("INVALID_ARGUMENT: text") }
            let session = NDEFSession(text: method == "writeText" ? args["text"] as? String : nil) { [weak self] result in self?.nfc = nil; complete(result) }
            nfc = session; session.begin(); return { [weak self, weak session] in session?.cancel(); self?.nfc = nil }
        }
        #endif
        guard pending == nil else { throw RadioFailure("INVALID_ARGUMENT: Bluetooth operation busy") }
        var begin: (() -> Void)?
        if method == "scan" { begin = try startScan(args) }
        guard Bundle.main.object(forInfoDictionaryKey: "NSBluetoothAlwaysUsageDescription") is String || Bundle.main.object(forInfoDictionaryKey: "NSBluetoothPeripheralUsageDescription") is String else { throw RadioFailure("UNSUPPORTED: Bluetooth usage description missing") }
        let manager = manager()
        if method != "scan" {
            guard let id = args["deviceId"] as? String, let peripheral = devices[id] else { throw RadioFailure("INVALID_ARGUMENT: deviceId (scan first)") }
            activePeripheral = peripheral; peripheral.delegate = self
            if method == "disconnect" { manager.cancelPeripheralConnection(peripheral); activePeripheral = nil; complete(.success(NSNull())); return nil }
            if method == "connect" { begin = { manager.connect(peripheral) } }
            else {
                guard peripheral.state == .connected else { throw RadioFailure("IO_ERROR: device disconnected") }
                if method == "getServices" { begin = { peripheral.discoverServices(nil) } }
                else {
                    guard let service = args["service"] as? String, let characteristic = args["characteristic"] as? String, validUUID(service), validUUID(characteristic),
                          let item = peripheral.services?.first(where: { $0.uuid == CBUUID(string: service) })?.characteristics?.first(where: { $0.uuid == CBUUID(string: characteristic) }) else { throw RadioFailure("INVALID_ARGUMENT: characteristic (getServices first)") }
                    target = item
                    if method == "read" { guard item.properties.contains(.read) else { throw RadioFailure("UNSUPPORTED: read") }; begin = { peripheral.readValue(for: item) } }
                    else if method == "write" {
                        guard item.properties.contains(.write) else { throw RadioFailure("UNSUPPORTED: write with response") }
                        guard let bytes = args["value"] as? [Int], bytes.allSatisfy({ $0 >= 0 && $0 <= 255 }), bytes.count <= peripheral.maximumWriteValueLength(for: .withResponse) else { throw RadioFailure("INVALID_ARGUMENT: value bytes or MTU") }
                        begin = { peripheral.writeValue(Data(bytes.map { UInt8($0) }), for: item, type: .withResponse) }
                    } else if method == "setNotify" { guard item.properties.contains(.notify) || item.properties.contains(.indicate), let enabled = args["enabled"] as? Bool else { throw RadioFailure("INVALID_ARGUMENT: notify") }; begin = { peripheral.setNotifyValue(enabled, for: item) } }
                }
            }
        }
        guard let begin else { throw RadioFailure("UNSUPPORTED") }
        pending = complete; operation = method
        let timeout = DispatchWorkItem { [weak self] in self?.central?.stopScan(); self?.ready = nil; self?.fail("TIMEOUT: Bluetooth") }; timer = timeout
        DispatchQueue.main.asyncAfter(deadline: .now() + 35, execute: timeout)
        if manager.state == .poweredOn { begin() }
        else if manager.state == .unknown || manager.state == .resetting { ready = begin }
        else { fail(manager.state == .unauthorized ? "PERMISSION_DENIED: Bluetooth" : "UNSUPPORTED: Bluetooth powered off/unavailable") }
        return { [weak self] in
            guard let self else { return }; self.ready = nil; self.central?.stopScan(); self.finish(.failure(RadioFailure("CANCELLED")))
            // Cancel an in-flight connect/discovery/read so a late callback cannot satisfy a later operation.
            for peripheral in self.devices.values where peripheral.state != .disconnected { self.central?.cancelPeripheralConnection(peripheral) }
        }
    }
    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        if central.state == .poweredOn { let action = ready; ready = nil; action?() }
        else if central.state != .unknown && central.state != .resetting { ready = nil; fail(central.state == .unauthorized ? "PERMISSION_DENIED: Bluetooth" : "UNSUPPORTED: Bluetooth unavailable") }
    }
    func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral, advertisementData: [String: Any], rssi RSSI: NSNumber) {
        let id = peripheral.identifier.uuidString; devices[id] = peripheral; found[id] = ["id": id, "name": peripheral.name ?? advertisementData[CBAdvertisementDataLocalNameKey] as? String ?? "", "rssi": RSSI]
    }
    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) { if operation == "connect", activePeripheral === peripheral { finish(.success(NSNull())) } }
    func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) { guard activePeripheral === peripheral else { return }; fail("IO_ERROR: connect " + (error?.localizedDescription ?? "failed")) }
    func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) { if pending != nil && operation != "scan" && activePeripheral === peripheral { fail("IO_ERROR: disconnected") } }
    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        guard operation == "getServices", activePeripheral === peripheral else { return }; if let error { fail("IO_ERROR: " + error.localizedDescription); return }
        guard let services = peripheral.services, !services.isEmpty else { finish(.success([Any]())); return }
        discovering = Set(services.map { $0.uuid.uuidString }); for service in services { peripheral.discoverCharacteristics(nil, for: service) }
    }
    private var discovering = Set<String>()
    func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        guard operation == "getServices", activePeripheral === peripheral else { return }; if let error { fail("IO_ERROR: " + error.localizedDescription); return }; discovering.remove(service.uuid.uuidString)
        if discovering.isEmpty { finish(.success((peripheral.services ?? []).flatMap { service in (service.characteristics ?? []).map { ["service": service.uuid.uuidString, "characteristic": $0.uuid.uuidString, "readable": $0.properties.contains(.read), "writable": $0.properties.contains(.write), "notifiable": $0.properties.contains(.notify) || $0.properties.contains(.indicate)] as [String: Any] } })) }
    }
    func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
        let bytes = (characteristic.value ?? Data()).map { Int($0) }
        if operation == "read", target === characteristic { if let error { fail("IO_ERROR: " + error.localizedDescription) } else { finish(.success(bytes)) } }
        if characteristic.isNotifying, error == nil { listeners.values.forEach { $0(["deviceId": peripheral.identifier.uuidString, "service": characteristic.service?.uuid.uuidString ?? "", "characteristic": characteristic.uuid.uuidString, "value": bytes]) } }
    }
    func peripheral(_ peripheral: CBPeripheral, didWriteValueFor characteristic: CBCharacteristic, error: Error?) { guard operation == "write", target === characteristic else { return }; if let error { fail("IO_ERROR: " + error.localizedDescription) } else { finish(.success(NSNull())) } }
    func peripheral(_ peripheral: CBPeripheral, didUpdateNotificationStateFor characteristic: CBCharacteristic, error: Error?) { guard operation == "setNotify", target === characteristic else { return }; if let error { fail("IO_ERROR: " + error.localizedDescription) } else { finish(.success(NSNull())) } }
    func dispose() {
        ready = nil; central?.stopScan(); timer?.cancel(); scanTimer?.cancel(); pending = nil; listeners.removeAll()
        for device in devices.values { device.delegate = nil; central?.cancelPeripheralConnection(device) }; devices.removeAll(); central?.delegate = nil
        #if os(iOS)
        nfc?.cancel(); nfc = nil
        #endif
    }
}

#if os(iOS)
private final class NDEFSession: NSObject, NFCNDEFReaderSessionDelegate {
    private var session: NFCNDEFReaderSession?
    private var complete: NativeCompletion?
    private let text: String?
    init(text: String?, complete: @escaping NativeCompletion) { self.text = text; self.complete = complete }
    func begin() { let value = NFCNDEFReaderSession(delegate: self, queue: .main, invalidateAfterFirstRead: false); session = value; value.alertMessage = text == nil ? "靠近 NDEF 标签读取" : "靠近可写 NDEF 标签"; value.begin() }
    private func finish(_ result: Result<Any, Error>) { if !Thread.isMainThread { DispatchQueue.main.async { self.finish(result) }; return }; let callback = complete; complete = nil; callback?(result); session?.invalidate(); session = nil }
    func cancel() { finish(.failure(RadioFailure("CANCELLED"))) }
    func readerSession(_ session: NFCNDEFReaderSession, didInvalidateWithError error: Error) {
        let code = (error as? NFCReaderError)?.code
        finish(.failure(RadioFailure(code == .readerSessionInvalidationErrorUserCanceled ? "CANCELLED" : code == .readerSessionInvalidationErrorSessionTimeout ? "TIMEOUT" : "IO_ERROR: NFC " + error.localizedDescription)))
    }
    func readerSession(_ session: NFCNDEFReaderSession, didDetectNDEFs messages: [NFCNDEFMessage]) {}
    func readerSession(_ session: NFCNDEFReaderSession, didDetect tags: [NFCNDEFTag]) {
        guard tags.count == 1, let tag = tags.first else { session.alertMessage = "请只靠近一个标签"; session.restartPolling(); return }
        session.connect(to: tag) { error in
            if let error { self.finish(.failure(RadioFailure("IO_ERROR: " + error.localizedDescription))); return }
            tag.queryNDEFStatus { status, capacity, error in
                if let error { self.finish(.failure(RadioFailure("IO_ERROR: " + error.localizedDescription))); return }
                guard status != .notSupported else { self.finish(.failure(RadioFailure("UNSUPPORTED: NDEF"))); return }
                if let text = self.text {
                    guard status == .readWrite, let record = NFCNDEFPayload.wellKnownTypeTextPayload(string: text, locale: Locale(identifier: "en")) else { self.finish(.failure(RadioFailure("PERMISSION_DENIED: read-only NFC tag"))); return }
                    let message = NFCNDEFMessage(records: [record]); guard message.length <= capacity else { self.finish(.failure(RadioFailure("INVALID_ARGUMENT: NFC capacity"))); return }
                    tag.writeNDEF(message) { error in self.finish(error.map { .failure(RadioFailure("IO_ERROR: " + $0.localizedDescription)) } ?? .success(NSNull())) }
                } else {
                    tag.readNDEF { message, error in
                        if let error { self.finish(.failure(RadioFailure("IO_ERROR: " + error.localizedDescription))); return }
                        self.finish(.success(["records": (message?.records ?? []).map { record -> [String: String] in
                            if let text = record.wellKnownTypeTextPayload().0 { return ["type": "text", "text": text] }
                            if let url = record.wellKnownTypeURIPayload() { return ["type": "url", "text": url.absoluteString] }
                            return ["type": String(data: record.type, encoding: .utf8) ?? "unknown", "text": record.payload.base64EncodedString()]
                        }]))
                    }
                }
            }
        }
    }
}
#endif
