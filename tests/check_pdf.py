import subprocess, sys, re
p = "/tmp/edited_out.pdf"
data = open(p, "rb").read()
print("size", len(data), "head", data[:8])
try:
    import pypdf
    r = pypdf.PdfReader(p)
    txt = "\n".join((pg.extract_text() or "") for pg in r.pages)
    print("EXTRACTED:", repr(txt))
    dev = re.findall(r"[\u0900-\u097F]+", txt)
    print("DEVANAGARI RUNS:", dev)
    print("QMARKS:", txt.count("?"))
    # fonts
    for pg in r.pages:
        res = pg.get("/Resources", {})
        fonts = res.get("/Font", {})
        for k, v in (fonts.items() if hasattr(fonts, "items") else []):
            o = v.get_object()
            print("FONT", k, o.get("/BaseFont"), o.get("/Subtype"))
except Exception as e:
    print("pypdf err", e)
