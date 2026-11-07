import os
import struct
import json

path = r'testing results\test7.glb'
size = os.path.getsize(path)
print(f"File size: {size} bytes ({size / (1024*1024):.2f} MB)")

with open(path, 'rb') as f:
    magic, version, length = struct.unpack('<4sII', f.read(12))
    print(f"Magic: {magic}, Version: {version}, Length: {length}")
    chunk0_len, chunk0_type = struct.unpack('<I4s', f.read(8))
    print(f"Chunk0: len={chunk0_len}, type={chunk0_type}")
    chunk0_data = f.read(chunk0_len)
    gltf = json.loads(chunk0_data.decode('utf-8'))
    
    # Check if there is chunk1 (BIN)
    if length > 12 + 8 + chunk0_len:
        chunk1_len, chunk1_type = struct.unpack('<I4s', f.read(8))
        print(f"Chunk1: len={chunk1_len}, type={chunk1_type}")

print("glTF keys:", list(gltf.keys()))
print("Asset info:", gltf.get('asset'))
print("Extensions used:", gltf.get('extensionsUsed'))
print("Extensions required:", gltf.get('extensionsRequired'))
meshes = gltf.get('meshes', [])
print(f"Mesh count: {len(meshes)}")
accessors = gltf.get('accessors', [])
print(f"Accessor count: {len(accessors)}")
materials = gltf.get('materials', [])
print(f"Material count: {len(materials)}")
textures = gltf.get('textures', [])
print(f"Texture count: {len(textures)}")
images = gltf.get('images', [])
print(f"Image count: {len(images)}")

total_prims = sum(len(m.get('primitives', [])) for m in meshes)
print(f"Total primitives: {total_prims}")

vertex_count = 0
triangle_count = 0
min_bound = [float('inf')]*3
max_bound = [float('-inf')]*3

for m in meshes:
    for p in m.get('primitives', []):
        attrs = p.get('attributes', {})
        pos_acc_idx = attrs.get('POSITION')
        if pos_acc_idx is not None:
            pos_acc = accessors[pos_acc_idx]
            vertex_count += pos_acc.get('count', 0)
            p_min = pos_acc.get('min', [])
            p_max = pos_acc.get('max', [])
            print(f"  Primitive pos bounds: min={p_min}, max={p_max}")
            for i in range(3):
                if i < len(p_min): min_bound[i] = min(min_bound[i], p_min[i])
                if i < len(p_max): max_bound[i] = max(max_bound[i], p_max[i])
        indices_acc_idx = p.get('indices')
        if indices_acc_idx is not None:
            ind_acc = accessors[indices_acc_idx]
            triangle_count += ind_acc.get('count', 0) // 3

print(f"Total vertices: {vertex_count}")
print(f"Total triangles: {triangle_count}")
print(f"Overall bounding box: min={min_bound}, max={max_bound}")
box_size = [max_bound[i] - min_bound[i] for i in range(3)]
print(f"Box size (dimensions): {box_size}")

# Check images/textures details
for idx, img in enumerate(images):
    print(f"Image {idx}: {img}")

# Check bufferViews
bufferViews = gltf.get('bufferViews', [])
print(f"bufferViews count: {len(bufferViews)}")
total_buffer_bytes = sum(bv.get('byteLength', 0) for bv in bufferViews)
print(f"Total bufferViews byteLength: {total_buffer_bytes} bytes ({total_buffer_bytes / (1024*1024):.2f} MB)")
