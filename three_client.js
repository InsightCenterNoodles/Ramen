
// Set up render window
width = 720 // window.innerWidth
height = 512

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(width, height);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.listenToKeyEvents(window); // optional
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.screenSpacePanning = false;
controls.minDistance = .1;
controls.maxDistance = 500;
controls.maxPolarAngle = Math.PI / 2;

const format_to_bytesize = {
    "U8": 1,
    "U8VEC4": 1 * 4,
    "U16": 2,
    "U16VEC2": 2 * 2,
    "U32": 4,
    "VEC2": 4 * 2,
    "VEC3": 4 * 3,
    "VEC4": 4 * 4,
    "MAT3": 4 * 3 * 3,
    "MAT4": 4 * 4 * 4
}

const format_to_simdcount = {
    "U8": 1,
    "U8VEC4": 4,
    "U16": 1,
    "U16VEC2": 2,
    "U32": 1,
    "VEC2": 2,
    "VEC3": 3,
    "VEC4": 4,
    "MAT3": 3 * 3,
    "MAT4": 4 * 4
}

function bytes_to_interleaved_buffer(format, bytes, offset, stride, vertex_count) {
    console.log(`Format to typed array Format: ${format}, Bytes len ${bytes.byteLength}, Offset ${offset}, Stride ${stride}, Vcount ${vertex_count}`)
    let arr = null;
    let interleaved_count = 0;
    const simd_byte_size = format_to_bytesize[format]

    switch (format) {
        case "U8":
        case "U8VEC4":
            arr = new Uint8Array(bytes, offset, stride * vertex_count)
            interleaved_count = 1;
            break;

        case "U16":
        case "U16VEC2":
            arr = new Uint16Array(bytes, offset, stride / 2 * vertex_count)
            interleaved_count = 2;
            break;

        case "U32":
            arr = new Uint32Array(bytes, offset, stride / 4 * vertex_count)
            interleaved_count = 4;
            break;
        case "VEC2":
        case "VEC3":
        case "VEC4":
        case "MAT3":
        case "MAT4":
            arr = new Float32Array(bytes, offset, stride / 4 * vertex_count)
            interleaved_count = 4;
            break;
        default:
            throw "Invalid format"
    }

    interleaved_count = stride / interleaved_count

    return new THREE.InterleavedBuffer(arr, interleaved_count)
}

function get_or_default(o, prop, def) {
    if (prop in o) return o[prop]
    return def
}

const semantic_translate = {
    "POSITION": "position",
    "NORMAL": "normal",
    "COLOR": "color",
    "TEXTURE": "uv",
}

function view_to_attribute(patch, attrib, three_geometry, on_done) {
    const sname = semantic_translate[attrib.semantic]

    let view = client.bufferview_list.get(attrib.view)
    let buffer = client.buffer_list.get(view.source_buffer)
    buffer.byte_promise.then(function (bytes) {
        console.log("Setting up attribute from view", attrib, view)
        console.log(`View of ${bytes.byteLength} bytes`)
        const offset = get_or_default(view, 'offset', 0) +
            get_or_default(attrib, 'offset', 0)

        const stride = function () {
            let f = format_to_bytesize[attrib.format]
            let s = get_or_default(attrib, 'stride', 0)
            if (s < f) s = f
            return s
        }();

        const length = stride * patch.vertex_count

        byte_view = new ArrayBuffer()

        const normalized = get_or_default(attrib, 'normalized', false)

        console.log("Resolved view parts", offset, length, stride)

        let interleaved_buffer = bytes_to_interleaved_buffer(
            attrib.format,
            bytes,
            offset, stride, patch.vertex_count
        );

        console.log("Interleaved attrib", interleaved_buffer)

        console.assert(interleaved_buffer.array.length > 0)

        let interleaved_attribute = new THREE.InterleavedBufferAttribute(
            interleaved_buffer,
            format_to_simdcount[attrib.format],
            //offset,
            0,
            normalized
        )

        three_geometry.setAttribute(sname, interleaved_attribute)

        console.log("Added attribute", interleaved_attribute, "to", three_geometry)

        on_done()

    });
}

function view_to_index(patch, three_geometry, on_done) {
    let index_info = p.indicies
    console.log("Adding index", index_info)

    let indicies = p.indicies
    let view = client.bufferview_list.get(indicies.view)
    let buffer = client.buffer_list.get(view.source_buffer)
    buffer.byte_promise.then(function (bytes) {
        console.log("Setting up index from view", view)
        console.log(`View of ${bytes.byteLength} bytes`)
        const offset = get_or_default(view, 'offset', 0) +
            get_or_default(indicies, 'offset', 0)

        let format_byte_size = format_to_bytesize[indicies.format]

        const count = index_info.count

        const stride = function () {
            let s = get_or_default(indicies, 'stride', 0)
            if (s < format_byte_size) s = format_byte_size
            return s
        }();

        if (stride != format_byte_size) {
            // do a copy
            throw "TODO: Do a copy here"
        }

        let typed_arr = [];

        switch (indicies.format) {
            case "U8":
                typed_arr = new Uint8Array(bytes, offset, count)
                three_geometry.setIndex(Array.from(typed_arr))
                break;
            case "U16":
                typed_arr = new Uint16Array(bytes, offset, count)
                three_geometry.setIndex(new THREE.Uint16BufferAttribute(typed_arr, 1))
                break;
            case "U32":
                typed_arr = new Uint32Array(bytes, offset, count)
                three_geometry.setIndex(new THREE.Uint32BufferAttribute(typed_arr, 1))
                break;
            default:
                throw "Invalid format"
        }

        // console.log(typed_arr)

        //three_geometry.setIndex(new BufferAttribute(typed_arr, 1))

        //three_geometry.setIndex(Array.from(typed_arr))

        console.log(`Added ${indicies.format} index ${typed_arr.length} to`, three_geometry)

        on_done()
    });
}

function make_instances(client, mesh, instances_source, buffer_data) {
    let view = client.bufferview_list.get(instances_source.view)

    console.log("Setting up instances");

    if ("stride" in instances_source) {
        let s = instances_source.stride
        if (s > format_to_bytesize["MAT4"]) {
            throw "TODO: need to copy instance data!"
        }
    }

    let instance_count = (buffer_data.byteLength - view.offset) / format_to_bytesize["MAT4"]

    let typed_arr = new Float32Array(buffer_data, view.offset, instance_count * 16)

    const matrix = new THREE.Matrix4();
    const offset = new THREE.Vector3();
    const color = new THREE.Vector3();
    const orientation = new THREE.Quaternion();
    const scale = new THREE.Vector3(1, 1, 1);

    for (let i = 0; i < instance_count; i++) {
        let float_offset = i * 16;

        let read_off = float_offset

        // stored in column order
        offset.set(
            typed_arr[read_off],
            typed_arr[read_off + 1],
            typed_arr[read_off + 2])

        read_off += 4

        color.set(
            typed_arr[read_off],
            typed_arr[read_off + 1],
            typed_arr[read_off + 2])

        read_off += 4

        orientation.set(
            typed_arr[read_off],
            typed_arr[read_off + 1],
            typed_arr[read_off + 2],
            typed_arr[read_off + 3])

        read_off += 4

        scale.set(
            typed_arr[read_off],
            typed_arr[read_off + 1],
            typed_arr[read_off + 2])

        matrix.compose(offset, orientation, scale);

        mesh.setMatrixAt(i, matrix);
        mesh.setColorAt(i, new THREE.Color(color.x, color.y, color.z))
    }

    mesh.instanceMatrix.needsUpdate = true
    mesh.instanceColor.needsUpdate = true
}

function noo_color_convert(noo_col) {
    console.log("COLOR", noo_col)
    return new THREE.Color(noo_col[0], noo_col[1], noo_col[2])
}

function make_render_rep(client, parent, render_rep) {

    let m = client.geometry_list.get(render_rep.mesh);

    let to_await = [m.pending_sub_meshs]

    if ("instances" in render_rep) {
        let inst = render_rep.instances

        let view = client.bufferview_list.get(inst.view)
        let buffer = client.buffer_list.get(view.source_buffer)

        to_await.push(buffer.byte_promise)
    }


    Promise.all(to_await).then(function (values) {
        let sub_meshes = values[0]
        console.log("Creating mesh group")
        let group = new THREE.Group()


        for (i of sub_meshes) {
            console.log("Adding sub object...", i)

            const noo_mat = client.material_list.get(i.noo_patch.material)

            let mat;

            switch (i.noo_patch.type) {
                case "POINTS":
                    mat = noo_mat.three_points
                    break;
                case "LINES":
                case "LINE_LOOP":
                case "LINE_STRIP":
                    mat = noo_mat.three_lines
                    break;
                case "TRIANGLES":
                case "TRIANGLE_STRIP":
                    mat = noo_mat.three_tris
                    break;
            }

            let sub_object

            if ("instances" in render_rep) {
                let inst = render_rep.instances

                let view = client.bufferview_list.get(inst.view)
                let buffer_data = values[1]

                let instance_count = (buffer_data.byteLength - view.offset) / format_to_bytesize["MAT4"]

                switch (i.noo_patch.type) {
                    case "TRIANGLES":
                        sub_object = new THREE.InstancedMesh(i, mat, instance_count)
                        make_instances(client, sub_object, inst, buffer_data)
                        break;
                    default:
                        throw "Not yet implemented"
                        break;
                }

            } else {
                switch (i.noo_patch.type) {
                    case "POINTS":
                        sub_object = new THREE.Points(i, mat)
                        break;
                    case "LINES":
                        sub_object = new THREE.LineSegments(i, mat)
                        break;
                    case "LINE_LOOP":
                        sub_object = new THREE.LineLoop(i, mat)
                        break;
                    case "LINE_STRIP":
                        sub_object = new THREE.Line(i, mat)
                        break;
                    case "TRIANGLES":
                        sub_object = new THREE.Mesh(i, mat)
                        break;
                    case "TRIANGLE_STRIP":
                        throw "Not yet implemented"
                        break;
                }
            }

            group.add(sub_object)
        }

        console.log("Adding group to parent", parent)

        parent.add(group)

    });
}

function on_entity_create(client, state) {
    console.log("New 3js entity")

    let e = new THREE.Object3D()
    state.three_entity = e

    e.name = state.name

    if (state.parent) {
        client.entity_list.get(state.parent).three_entity.add(e)
    } else {
        scene.add(e)
    }

    if (state.transform) {
        e.matrixAutoUpdate = false
        e.matrixWorldNeedsUpdate = true
        let m = new THREE.Matrix4()
        m.set(...state.transform)
        m.transpose();
        console.log("UPDATE TF", e.uuid, state.transform, m);
        e.matrix = m
    }

    if (state.render_rep) {
        state.concrete_rep = make_render_rep(client, e, state.render_rep)
    }

}

function is_null_id(id) {
    return (id[0] == 4294967295 || id[1] == 4294967295);
}

function erase_children(e) {
    while (e.children.length) {
        e.remove(e.children[0])
    }
}

function on_entity_update(client, state, new_state) {
    console.log("Update 3js entity")

    let e = state.three_entity

    if (new_state.parent) {
        e.removeFromParent()

        if (is_null_id(state.parent)) {
            scene.add(e)
        } else {
            client.entity_list.get(state.parent).three_entity.add(e)
        }
    }

    if (state.transform) {
        e.matrixAutoUpdate = false
        e.matrixWorldNeedsUpdate = true
        let m = new THREE.Matrix4()
        m.set(...state.transform)
        m.transpose();
        console.log("UPDATE TF", e.uuid, state.transform, m);
        e.matrix = m
    }

    if (state.render_rep) {
        erase_children(e)
        state.concrete_rep = make_render_rep(client, e, state.render_rep)
    }

}

function on_entity_delete(client, state) {
    let e = state.three_entity

    e.removeFromParent()

    if (state.concrete_rep) {
        erase_children(e)
    }
}

function on_buffer_create(client, state) {
    console.log(state)

    state.byte_promise = new Promise(function (resolve, reject) {
        if ("inline_bytes" in state) {
            //console.log(state.inline_bytes.buffer)
            // plain .buffer might not refer to the right thing..

            const arr = state.inline_bytes

            const view = arr.buffer.slice(arr.byteOffset, arr.byteLength + arr.byteOffset)

            resolve(view);
            return;
        }

        let req = new XMLHttpRequest();
        req.open("GET", state.uri_bytes)
        req.responseType = "arraybuffer";
        req.onload = function () {
            if (req.status == 200) {
                console.log("Download completed")
                console.log(req.response)
                resolve(req.response)
            } else {
                reject("Buffer not found")
            }
        }
        req.send();
    });
}

function on_mesh_create(client, state) {
    state.pending_sub_meshs = new Promise(function (resolve) {

        let arr = []

        console.log("Mesh", state.patches)

        let to_go = state.patches.length

        let dec_func = function () {
            to_go -= 1

            if (to_go == 0) {
                resolve(arr)
            }
        }

        for (p of state.patches) {
            let g = new THREE.BufferGeometry();

            g.noo_patch = p

            console.log("Patch", p)
            for (a of p.attributes) {

                view_to_attribute(p, a, g, dec_func)

                console.log("Attribute", a.semantic)
            }

            if ("indicies" in p) {
                to_go += 1
                view_to_index(p, g, dec_func)
            }

            console.log("Adding sub mesh...")
            arr.push(g)
        }
    });

}

function on_mesh_delete(client, state) {
    state.pending_sub_meshs.then(
        function (value) {
            for (i of value) {
                i.dispose()
            }
        }
    )
}

function on_material_create(client, state) {
    console.log("NEW MATERIAL", state)
    const noo_pbr = state.pbr_info

    const noo_base_col = noo_color_convert(noo_pbr.base_color)

    state.three_points = new THREE.PointsMaterial({ color: noo_base_col })
    state.three_lines = new THREE.LineBasicMaterial({ color: noo_base_col })
    state.three_tris = new THREE.MeshPhysicalMaterial({
        color: noo_base_col,
        metalness: noo_pbr.metallic,
        roughness: noo_pbr.roughness,
    })
}

function on_material_delete(client, state) {
    state.three_points.dispose()
    state.three_lines.dispose()
    state.three_tris.dispose()
}

function start_connect() {
    let url;
    try {
        url = new URL(document.getElementById("server_url").value);
    } catch {
        url = new URL("ws://localhost:50000");
    }

    console.log(`Starting connection to ${url}`)

    client = NOO.connect(url.toString(),
        {
            entity: {
                on_create: on_entity_create,
                on_update: on_entity_update,
                on_delete: on_entity_delete
            },
            buffer: { on_create: on_buffer_create },
            //       bufferview : { on_create : on_bufferview_create },
            geometry: {
                on_create: on_mesh_create,
                on_delete: on_mesh_delete
            },
            material: {
                on_create: on_material_create,
                on_delete: on_material_delete
            }
        }
    )
}


if (false) {
    const geometry = new THREE.BoxGeometry(.1, .1, .1);
    const material = new THREE.MeshPhysicalMaterial({ color: 0x00ff00 });

    const cube = new THREE.Mesh(geometry, material);
    scene.add(cube);
}

{
    let light_object = new THREE.DirectionalLight(0xffffff, 1.0)

    light_object.position.set(1, 1, 1)
    light_object.castShadow = true

    scene.add(light_object)

    let light_object2 = new THREE.DirectionalLight(0xf0f0ff, 1.0)

    light_object2.position.set(-1, 1, -1)
    light_object2.castShadow = false

    scene.add(light_object2)

    let amb_light_object = new THREE.AmbientLight(0x101010)
    scene.add(amb_light_object)
}

camera.position.z = 5;

function animate() {
    requestAnimationFrame(animate);

    controls.update();

    renderer.render(scene, camera);
}

animate();