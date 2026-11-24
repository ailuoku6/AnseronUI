package org.anseronui.render

import org.json.JSONArray
import org.json.JSONObject

/** Pure preflight graph. Paint commits touch only the referenced entries;
 * topology commits copy only the child lists that they change. */
internal class RenderTopology {
    private data class Entry(val kind: String, var parent: Long? = null, var children: List<Long> = emptyList())
    private val records = mutableMapOf<Long, Entry>()
    private var roots: List<Long> = emptyList()
    fun clear() { records.clear(); roots = emptyList() }
    fun rootId(): Long? = roots.firstOrNull()
    fun ancestors(id: Long): List<Long> {
        val result = mutableListOf<Long>(); var next = id
        while (next != 0L) { val record = records[next] ?: break; result.add(next); next = record.parent ?: 0L }
        return result
    }
    fun prepare(commands: JSONArray): () -> Unit {
        val edits = mutableMapOf<Long, Entry>(); val removed = mutableSetOf<Long>(); var nextRoots = roots
        fun get(id: Long): Entry { require(id !in removed); return edits[id] ?: records[id] ?: error("UNKNOWN_RENDER_NODE") }
        fun edit(id: Long): Entry = edits.getOrPut(id) { get(id).copy() }
        fun list(id: Long): List<Long> = if (id == 0L) nextRoots else get(id).children
        fun setList(id: Long, children: List<Long>) { if (id == 0L) nextRoots = children else edit(id).children = children }
        fun detach(id: Long) { val record = edit(id); record.parent?.let { parent -> setList(parent, list(parent).filter { it != id }) }; record.parent = null }
        fun remove(id: Long) { get(id).children.forEach { remove(it) }; removed.add(id); edits.remove(id) }
        for (i in 0 until commands.length()) {
            val c = commands.getJSONObject(i); val id = c.getLong("nodeId"); require(id in 1..0xffffffffL)
            if (c.getString("type") == "CreateNode") { require(id !in records && id !in edits && id !in removed); edits[id] = Entry(c.getString("kind")); continue }
            get(id)
            when (c.getString("type")) {
                "InsertChild", "MoveChild" -> {
                    val parent = c.getLong("parentId"); require(parent in 0..0xffffffffL)
                    if (parent != 0L) require(get(parent).kind in setOf("View", "ScrollView", "Native"))
                    var ancestor = parent
                    while (ancestor != 0L) { require(ancestor != id) { "RENDER_CYCLE" }; ancestor = get(ancestor).parent ?: 0L }
                    detach(id); val children = list(parent).toMutableList(); val index = c.getInt("index"); require(index in 0..children.size)
                    children.add(index, id); setList(parent, children); edit(id).parent = parent
                }
                "DetachChild" -> detach(id)
                "RemoveNode" -> { detach(id); remove(id) }
            }
        }
        return { removed.forEach { records.remove(it) }; records.putAll(edits); roots = nextRoots }
    }
}
