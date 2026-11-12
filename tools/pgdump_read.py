"""Minimal reader for pg_dump custom-format archives (no pg_restore needed).

usage: python3 -I pgdump_read.py <dump> <out_dir>
Writes toc.txt (all TOC entries with their SQL) and data/<schema>.<table>.tsv (COPY data).
Supabase dumps are zstd-compressed: needs `pip install zstandard` (in a virtualenv).
"""
import os, sys, zlib

path, out = sys.argv[1], sys.argv[2]
buf = open(path, "rb").read()
pos = 0

def byte():
    global pos
    b = buf[pos]; pos += 1; return b

assert buf[:5] == b"PGDMP"; pos = 5
vmaj, vmin, vrev = byte(), byte(), byte()
int_size, off_size, fmt = byte(), byte(), byte()
ver = (vmaj, vmin, vrev)

def rint():
    global pos
    sign = byte()
    v = int.from_bytes(buf[pos:pos + int_size], "little"); pos += int_size
    return -v if sign else v

def rstr():
    global pos
    n = rint()
    if n < 0: return None
    s = buf[pos:pos + n].decode("utf-8", "replace"); pos += n
    return s

def roff():
    global pos
    flag = byte()
    v = int.from_bytes(buf[pos:pos + off_size], "little"); pos += off_size
    return flag, v

if ver >= (1, 15, 0):
    comp = byte()            # 0 none, 1 gzip, 2 lz4, 3 zstd
else:
    comp = 1 if rint() != 0 else 0
for _ in range(7): rint()     # timestamp
dbname, remote_ver, dump_ver = rstr(), rstr(), rstr()
n_toc = rint()

entries = []
for _ in range(n_toc):
    e = {}
    e["id"] = rint(); e["had_dumper"] = rint()
    e["tableoid"] = rstr(); e["oid"] = rstr()
    e["tag"] = rstr(); e["desc"] = rstr(); e["section"] = rint()
    e["defn"] = rstr(); e["drop"] = rstr(); e["copy"] = rstr()
    e["ns"] = rstr(); e["tablespace"] = rstr()
    if ver >= (1, 14, 0): e["tableam"] = rstr()
    if ver >= (1, 16, 0): e["relkind"] = rint()
    e["owner"] = rstr(); rstr()  # with_oids
    while rstr() is not None: pass  # deps
    e["off"] = roff()
    entries.append(e)

os.makedirs(os.path.join(out, "data"), exist_ok=True)
with open(os.path.join(out, "toc.txt"), "w") as f:
    f.write(f"archive {ver} compression={comp} db={dbname} server={remote_ver} pg_dump={dump_ver}\n\n")
    for e in entries:
        f.write(f"-- [{e['id']}] {e['desc']} {e['ns']}.{e['tag']}\n")
        if e["defn"]: f.write(e["defn"].rstrip() + "\n")
        f.write("\n")

def read_block(offset):
    global pos
    pos = offset
    btype = byte(); rint()  # block type, dump id
    raw = bytearray()
    while True:
        n = rint()
        if n == 0: break
        raw += buf[pos:pos + n]; pos += n
    if comp == 1: return zlib.decompress(bytes(raw))
    if comp == 0: return bytes(raw)
    if comp == 3:
        import zstandard
        return zstandard.ZstdDecompressor().decompressobj().decompress(bytes(raw))
    raise SystemExit(f"unsupported compression {comp}")

counts = []
for e in entries:
    if e["desc"] != "TABLE DATA": continue
    flag, offset = e["off"]
    if flag != 2: continue  # 2 = position set
    data = read_block(offset).decode("utf-8", "replace")
    name = f"{e['ns']}.{e['tag']}"
    with open(os.path.join(out, "data", name + ".tsv"), "w") as f:
        f.write(e["copy"] or ""); f.write("\n"); f.write(data)
    rows = data.count("\n") - (1 if data.endswith("\\.\n") else 0)
    counts.append((name, rows))
for name, rows in sorted(counts): print(f"{rows:6d}  {name}")
