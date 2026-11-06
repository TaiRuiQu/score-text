"""Independent MusicXML XSD and rendered PDF checks. uv run --with lxml --with pymupdf python scripts/verify-exports.py"""
from pathlib import Path
from lxml import etree
import pymupdf

root = Path(__file__).resolve().parents[1]
schema_dir = root / "test/fixtures/musicxml"

class LocalSchemaResolver(etree.Resolver):
    def resolve(self, url, public_id, context):
        name = url.rsplit("/", 1)[-1]
        if (schema_dir / name).exists():
            return self.resolve_filename(str(schema_dir / name), context)

parser = etree.XMLParser(no_network=True)
parser.resolvers.add(LocalSchemaResolver())
schema = etree.XMLSchema(etree.parse(str(schema_dir / "musicxml.xsd"), parser))
output = root / "output"
checks = root / "tmp/qa"
checks.mkdir(parents=True, exist_ok=True)
for name in ("reference-pop", "strum-pop", "ensemble", "ode-to-joy"):
    document = etree.parse(str(output / f"{name}.musicxml"))
    schema.assertValid(document)
    pdf = pymupdf.open(output / f"{name}.pdf")
    for i, page in enumerate(pdf):
        assert page.rect.width > 500
        pixmap = page.get_pixmap(matrix=pymupdf.Matrix(1.4, 1.4), alpha=False)
        pixmap.save(checks / f"{name}-pdf-{i+1}.png")
        assert any(channel < 200 for channel in pixmap.samples), "Empty PDF page"
        png_path = output / (f"{name}.png" if len(pdf) == 1 else f"{name}-{i+1}.png")
        reference = pymupdf.Pixmap(str(png_path))
        scale = reference.width / page.rect.width
        actual = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), alpha=False)
        assert abs(actual.width - reference.width) <= 1
        assert abs(actual.height - reference.height) <= 1
        ref_bytes, out_bytes = reference.samples, actual.samples
        ref_dark = out_dark = both_dark = 0
        for y in range(0, min(actual.height, reference.height), 2):
            for x in range(0, min(actual.width, reference.width), 2):
                ref_black = ref_bytes[y * reference.stride + x * reference.n] < 160
                out_black = out_bytes[y * actual.stride + x * actual.n] < 160
                ref_dark += ref_black
                out_dark += out_black
                both_dark += ref_black and out_black
        overlap = both_dark / max(1, min(ref_dark, out_dark))
        assert overlap > 0.65, f"PDF/PNG geometry mismatch: {name} page {i+1}, overlap {overlap:.2%}"
        print(f"  page {i+1}: PDF/PNG dark-pixel overlap {overlap:.1%}")
    print(f"{name}: MusicXML 4.0 XSD valid; {len(pdf)} PDF pages rasterized")
