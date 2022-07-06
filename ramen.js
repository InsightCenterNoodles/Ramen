(function(global, undefined) { "use strict";

/*
delegates can have 
on_create(state)
on_delete(state)
on_update(state)
*/

const client_delegate_maker = {
    method : null,
    signal : null,
    entity : null,
    plot : null,
    buffer : null,
    bufferview : null,
    material : null,
    image : null,
    texture : null,
    sampler : null,
    light : null,
    geometry : null,
    table : null,
    document : null,
}

class DelegateList {
    constructor(n) {
        this.name = n
        this.slot_list = {}
        this.client_delegate = null
    }

    reset() { 
        this.slot_list = {}
    }

    on_create_msg(m) {
        let slot = m.id[0]
        console.log(this.name, "create", slot)
        this.slot_list[slot] = m
        if (this.client_delegate.on_create){
            this.client_delegate.on_create(m)
        }
    }
    on_delete_msg(m) {
        let slot = m.id[0]
        console.log(this.name, "delete", slot)
        if (this.client_delegate.on_delete){
            this.client_delegate.on_delete(this.slot_list[slot])
        }
        delete this.slot_list[slot]
    }
    on_update_msg(m) {
        console.log(this.name, "update", slot)
        let slot = m.id[0]
        update_keys(this.slot_list[slot], m)
        if (this.client_delegate.on_update){
            this.client_delegate.on_update(m)
        }
    }
}

function update_keys(old_o, new_o) {
    //console.log("update keys:", old_o, new_o)
    for (const [key, value] of Object.entries(new_o)) {
        //console.log("Update", key, value)
        old_o[key] = value
    }
}

class State {
    constructor(delegate_makers) {
        this.makers = delegate_makers

        console.log(this.makers)

        this.delegate_lists = {}
        this.delegate_handlers = new Map()

        this.document = {}

        this.add_delegate("method", 0, 1)
        this.add_delegate("signal", 2, 3)
        this.add_delegate("entity", 4, 6, 5)
        this.add_delegate("plot", 7, 9, 8)
        this.add_delegate("buffer", 10, 11)
        this.add_delegate("bufferview", 12, 13)
        this.add_delegate("material", 14, 16, 15)
        this.add_delegate("image", 17, 18)
        this.add_delegate("texture", 19, 20)
        this.add_delegate("sampler", 21, 22)
        this.add_delegate("light", 23, 25, 24)
        this.add_delegate("geometry", 26, 27)
        this.add_delegate("table", 28, 30, 29)

        this.delegate_handlers.set(31, this.on_document_update.bind(this))
        this.delegate_handlers.set(32, this.on_document_reset.bind(this))
        this.delegate_handlers.set(33, this.on_signal_invoke.bind(this))
        this.delegate_handlers.set(34, this.on_method_reply.bind(this))
    }

    on_document_update(m) {
        update_keys(this.document, m)
        console.log("here", this.document)
    }

    on_document_reset() {
        for (value in this.delegate_lists){
            value.reset()
        }
    }

    on_signal_invoke(m) {

    }

    on_method_reply(m) {

    }

    add_delegate(name, create_mid, delete_mid, update_mid) {
        console.log("Adding delegate list", name)
        let dl = new DelegateList(name);

        let client_delegate_template = {
            on_create : function(state) {},
            on_delete : function(state) {},
            on_update : function(state) {},
        }

        try {
            update_keys(client_delegate_template, this.makers[name])
            console.log(`Installing delegates for ${name}`)
        } catch (error) {
            console.log(`No delegates for ${name}`)
        }

        dl.client_delegate = client_delegate_template

        this.delegate_lists[name] = dl

        this.delegate_handlers.set(create_mid, dl.on_create_msg.bind(dl))
        this.delegate_handlers.set(delete_mid, dl.on_delete_msg.bind(dl))

        if (update_mid !== undefined) { 
            this.delegate_handlers.set(update_mid, dl.on_update_msg.bind(dl))
        }
    }

    handle_message(mid, content) {
        console.log("Handling", mid, content)

        if (!this.delegate_handlers.has(mid)) {
            console.log("unknown message")
            return;
        }

        this.delegate_handlers.get(mid)(content)
    }
}

class Client {
    constructor(url, delegate_makers) {
        this.state = new State(delegate_makers)

        this.socket = new WebSocket(url)
        this.socket.binaryType = "arraybuffer"

        this.socket.onopen = this.on_open.bind(this)
        this.socket.onmessage = this.on_message.bind(this)
        this.socket.onclose = this.on_close.bind(this)
        this.socket.onerror = this.on_socket_error.bind(this)   
    }

    on_open(e) {
        let intro = [0,{
            client_name: "Web Browser"
        }]

        this.socket.send(CBOR.encode(intro))
    }

    on_message(e) {
        var decoded = CBOR.decode(e.data);   
        
        for (let i = 0, len = decoded.length; i < len; i += 2) {
            this.state.handle_message(decoded[i], decoded[i+1])
        }
    }

    on_close(e) {
        if (e.wasClean) {
            console.log(`[websocket][close] Connection closed: ${e.reason}`)
        } else {
            console.log(`[websocket][close] Connection killed`)
        }
        
    }

    on_socket_error(e) {
        console.log(`[websocket][error] ${e.message}`)
    }
}

function connect(url, delegate_makers) {
    return new Client(url, delegate_makers)
}

//var obj = { encode: encode, decode: decode };
var obj = {connect: connect}

if (typeof define === "function" && define.amd)
  define("noo/noo", obj);
else if (typeof module !== "undefined" && module.exports)
  module.exports = obj;
else if (!global.NOO)
  global.NOO = obj;

})(this);
