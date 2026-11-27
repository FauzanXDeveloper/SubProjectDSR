#!/usr/bin/env python3
"""OCR helper for scanned Personal Financing-i application forms.

The calculator can read the DIGITAL form (react-pdf, 2025/vTB/Dec2025)
directly in the browser. The older ERG/08/2026 template is usually a scan
with no text layer, so the browser cannot read it. This helper OCRs the
scanned form and writes a partial case file that can be imported with
"Import case" in the calculator.

What it reads
  - Full name, NRIC
  - No. of Dependants  -> Number of Household
  - Company postcode / town / state -> Workplace Location
  - Financing Limit Requested, Tenure of Financing

What it cannot read
  - Tick boxes (Permanent Staff vs Contract Staff, Salaried vs Self-Employed).
    OCR sees the printed labels, not the tick, so Nature of Employment is
    left blank for the underwriter to select.

Requirements
  pip install pymupdf rapidocr-onnxruntime

Usage
  python tools/ocr_appform.py --pdf "1.FORM.pdf" --out case.json
  python tools/ocr_appform.py --pdf "1.FORM.pdf" --pages 1-3 --json
"""

import argparse
import datetime
import json
import os
import re
import sys

try:
    import fitz
except ImportError:
    sys.exit("PyMuPDF is required: pip install pymupdf")

try:
    from rapidocr_onnxruntime import RapidOCR
except ImportError:
    sys.exit("RapidOCR is required: pip install rapidocr-onnxruntime")


CASE_FORMAT = "dsr-calculator-case"
CASE_VERSION = 1

BUCKET_LABELS = {
    "WP_KUALA_LUMPUR": "Wilayah Persekutuan Kuala Lumpur (Urban)",
    "WP_PUTRAJAYA": "Wilayah Persekutuan Putrajaya (Urban)",
    "PETALING_JAYA": "Petaling Jaya (Urban)",
    "SUBANG_JAYA": "Subang Jaya (Urban)",
    "SHAH_ALAM": "Shah Alam (Urban)",
    "PENANG_ISLAND": "Penang Island (Urban)",
    "JOHOR_BAHRU": "Johor Bahru (Urban)",
    "OUTSIDE_MALAYSIA": "Outside Malaysia (Urban)",
    "OTHERS": "Others (Sub-Urban)",
}


def norm(value):
    """Upper-case, letters and digits only - for label matching."""
    return re.sub(r"[^A-Z0-9]", "", str(value or "").upper())


def rebuild_spacing(entry, ratio=0.7):
    """RapidOCR drops spaces on tight print; rebuild them from character boxes."""
    text = entry[1]
    boxes = entry[3] if len(entry) > 3 else None
    if not boxes or len(boxes) != len(text):
        return text
    try:
        spans = [(min(p[0] for p in b), max(p[0] for p in b)) for b in boxes]
        widths = sorted(b - a for a, b in spans)
        median = widths[len(widths) // 2] if widths else 0
        if not median:
            return text
        out = [text[0]]
        for i in range(1, len(text)):
            gap = spans[i][0] - spans[i - 1][1]
            out.append(" " if gap > median * ratio else "")
            out.append(text[i])
        return "".join(out)
    except Exception:
        return text


def ocr_page(engine, page, dpi):
    pix = page.get_pixmap(dpi=dpi)
    import tempfile
    fd, path = tempfile.mkstemp(suffix=".png")
    os.close(fd)
    try:
        pix.save(path)
        result, _ = engine(path, return_word_box=True)
    finally:
        try:
            os.remove(path)
        except OSError:
            pass

    lines = []
    for entry in result or []:
        box = entry[0]
        text = rebuild_spacing(entry, 0.7).strip()
        alt = rebuild_spacing(entry, 0.3).strip()
        if not text:
            continue
        lines.append({
            "text": text,
            "alt": alt,
            "norm": norm(text),
            "x": min(p[0] for p in box),
            "y": min(p[1] for p in box),
            "score": entry[2] if len(entry) > 2 else 0,
        })
    lines.sort(key=lambda l: (l["y"], l["x"]))
    return lines


def find_line(lines, label_norm, start=0):
    for i in range(start, len(lines)):
        if lines[i]["norm"].startswith(label_norm) or label_norm in lines[i]["norm"]:
            return i
    return -1


def value_of(lines, index, y_tolerance=95):
    """Value in the cell below the label (same page), preferring the same column."""
    if index < 0:
        return ""
    label = lines[index]
    text = label["text"]
    if ":" in text:
        tail = text.split(":", 1)[1].strip()
        if tail:
            return tail

    best = ""
    best_key = None
    for j in range(index + 1, len(lines)):
        candidate_line = lines[j]
        if candidate_line.get("page") != label.get("page"):
            break
        dy = candidate_line["y"] - label["y"]
        if dy < 2:
            continue
        if dy > y_tolerance:
            break
        candidate = candidate_line["text"].strip()
        if not candidate or ":" in candidate:
            continue
        key = (abs(candidate_line["x"] - label["x"]), dy)
        if best_key is None or key < best_key:
            best_key = key
            best = candidate
    return best


def clean_value(value):
    text = str(value or "").strip()
    text = re.sub(r"[\[\]|]+$", "", text).strip()
    return text


def money(value):
    match = re.search(r"(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)", str(value or ""))
    if not match:
        return ""
    result = match.group(1).replace(",", "")
    return result[:-3] if result.endswith(".00") else result


def digits(value):
    return re.sub(r"\D", "", str(value or ""))


def household_from_dependants(dependants):
    if dependants == "":
        return ""
    n = int(dependants)
    if n <= 1:
        return "1"
    if n in (2, 3):
        return str(n)
    return "4"


def load_geo():
    """Read postcode -> (state, city) from data/geo/myPostcodes.js."""
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "geo", "myPostcodes.js")
    if not os.path.isfile(path):
        return {}
    text = open(path, encoding="utf-8").read()
    match = re.search(r'rows:\s*("(?:[^"\\]|\\.)*")', text, re.S)
    if not match:
        return {}
    table = {}
    for line in json.loads(match.group(1)).split("\n"):
        parts = line.split("|")
        if len(parts) >= 3:
            table[parts[0]] = (parts[1], parts[2])
    return table


def bucket_for(state, city, postcode):
    s = str(state or "").upper()
    c = str(city or "").upper()
    try:
        n = int(postcode)
    except (TypeError, ValueError):
        n = -1
    if "KUALA LUMPUR" in s:
        return "WP_KUALA_LUMPUR"
    if "PUTRAJAYA" in s or "PUTRAJAYA" in c:
        return "WP_PUTRAJAYA"
    if "PETALING JAYA" in c:
        return "PETALING_JAYA"
    if "SUBANG JAYA" in c:
        return "SUBANG_JAYA"
    if "SHAH ALAM" in c:
        return "SHAH_ALAM"
    if "JOHOR BAHRU" in c:
        return "JOHOR_BAHRU"
    if "PULAU PINANG" in s or "PENANG" in s:
        return "PENANG_ISLAND" if 10000 <= n <= 11999 else "OTHERS"
    return "OTHERS"


def parse_range(value):
    match = re.fullmatch(r"(\d+)\s*-\s*(\d+)", str(value))
    if match:
        return int(match.group(1)), int(match.group(2))
    number = int(value)
    return 1, number


def extract(pdf_path, first_page, last_page, dpi, verbose=True):
    doc = fitz.open(pdf_path)
    last_page = min(last_page, doc.page_count)
    engine = RapidOCR()

    lines = []
    for page_number in range(first_page, last_page + 1):
        if verbose:
            print("  OCR page %d/%d ..." % (page_number, last_page), file=sys.stderr)
        for line in ocr_page(engine, doc[page_number - 1], dpi):
            line["page"] = page_number
            lines.append(line)

    warnings = []
    fields = {}

    name_index = find_line(lines, "FULLNAME")
    fields["name"] = clean_value(value_of(lines, name_index))
    if fields["name"] and " " not in fields["name"] and len(fields["name"]) > 10:
        alt_by_text = {line["text"]: line.get("alt", line["text"]) for line in lines}
        fields["name"] = alt_by_text.get(fields["name"], fields["name"])
    ic_raw = clean_value(value_of(lines, find_line(lines, "NEWNRICNO")))
    ic_match = re.search(r"\d{6}-\d{2}-\d{4}", ic_raw) or re.search(r"\d{12}", ic_raw)
    fields["ic"] = digits(ic_match.group(0)) if ic_match else ""

    dep_index = find_line(lines, "NOOFDEPENDANTS")
    dep_raw = clean_value(value_of(lines, dep_index))
    dep_digits = digits(dep_raw)
    fields["dependants"] = str(int(dep_digits)) if dep_digits else ""

    fields["financingAmount"] = money(value_of(lines, find_line(lines, "FINANCINGLIMITREQUESTED")))
    tenure_raw = value_of(lines, find_line(lines, "TENUREOFFINANCING"))
    tenure_digits = digits(tenure_raw)
    fields["tenureMonths"] = tenure_digits[:3] if tenure_digits else ""

    # Company address sits in the employment section - scope the labels there.
    employment = find_line(lines, "APPLICANTSCURRENTEMPLOYMENT")
    if employment < 0:
        employment = find_line(lines, "CURRENTEMPLOYMENT")
    fields["companyAddress"] = clean_value(value_of(lines, find_line(lines, "COMPANYADDRESS", max(employment, 0))))
    postcode = digits(value_of(lines, find_line(lines, "POSTCODE", max(employment, 0))))
    fields["companyPostcode"] = postcode[:5]
    fields["companyTown"] = clean_value(value_of(lines, find_line(lines, "TOWN", max(employment, 0))))
    fields["companyState"] = clean_value(value_of(lines, find_line(lines, "STATE", max(employment, 0))))

    # The postcode table is the authority for town / state (OCR misreads them).
    record = load_geo().get(fields["companyPostcode"]) if fields["companyPostcode"] else None
    if record:
        fields["companyState"], fields["companyTown"] = record

    bucket = bucket_for(fields["companyState"], fields["companyTown"], fields["companyPostcode"])
    free_text = "" if bucket != "OTHERS" else ", ".join(
        v for v in [fields["companyTown"], fields["companyState"]] if v)

    household = household_from_dependants(fields["dependants"])

    if not fields["name"]:
        warnings.append("Name not read - key it in.")
    if not fields["ic"]:
        warnings.append("NRIC not read - key it in.")
    if not fields["dependants"]:
        warnings.append("No. of Dependants not read - set Number of Household manually.")
    if not fields["companyPostcode"]:
        warnings.append("Company postcode not read - set Workplace Location manually.")
    warnings.append("Nature of Employment is a tick box and cannot be OCR-read - select it manually.")
    warnings.append("Check the name spacing - OCR merges some words; the field is editable.")

    present = {k: bool(v) for k, v in fields.items()}

    return {
        "fields": fields,
        "present": present,
        "bucket": bucket,
        "bucketLabel": BUCKET_LABELS[bucket],
        "freeText": free_text,
        "household": household,
        "warnings": warnings,
        "pages": (first_page, last_page),
        "lineCount": len(lines),
    }


def build_case(parsed, pdf_path):
    fields = parsed["fields"]

    customer = {
        "name": fields["name"],
        "ic": fields["ic"],
        "fromAppForm": True,
        "appForm": {
            "fileName": os.path.basename(pdf_path),
            "fields": fields,
            "found": parsed["present"],
            "warnings": parsed["warnings"],
        },
        "natureOfEmployment": "",
        "natureOfEmploymentOther": "",
        "householdSize": parsed["household"],
        "workplaceLocation": parsed["bucket"],
        "workplaceLocationOther": parsed["freeText"],
        "companyAddress": fields["companyAddress"],
        "companyPostcode": fields["companyPostcode"],
        "companyTown": fields["companyTown"],
        "companyState": fields["companyState"],
        "geoPostcode": fields["companyPostcode"],
        "geoMethod": "POSTCODE" if fields["companyPostcode"] else "OCR",
        "geoConfidence": "MEDIUM" if fields["companyPostcode"] else "LOW",
    }

    return {
        "format": CASE_FORMAT,
        "version": CASE_VERSION,
        "exportedAt": datetime.datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
        "exportedBy": "OCR helper (tools/ocr_appform.py)",
        "mode": "pf",
        "state": {
            "customer": customer,
            "pf": {
                "amount": fields["financingAmount"],
                "tenureMonths": fields["tenureMonths"],
            },
        },
    }


def main():
    parser = argparse.ArgumentParser(description="OCR a scanned PF application form into an importable case file.")
    parser.add_argument("--pdf", required=True, help="scanned application form PDF")
    parser.add_argument("--out", help="output case JSON (omit to print only)")
    parser.add_argument("--pages", default="1-3", help="page range to OCR, e.g. 1-3 (default)")
    parser.add_argument("--dpi", type=int, default=200, help="render DPI (default 200)")
    parser.add_argument("--json", action="store_true", help="print the full case JSON")
    args = parser.parse_args()

    if not os.path.isfile(args.pdf):
        sys.exit("PDF not found: " + args.pdf)

    first, last = parse_range(args.pages)
    parsed = extract(args.pdf, first, last, args.dpi)
    case = build_case(parsed, args.pdf)

    print("\nExtracted from %s (pages %s)" % (os.path.basename(args.pdf), parsed["pages"]))
    for key in ("name", "ic", "dependants", "financingAmount", "tenureMonths",
                "companyAddress", "companyPostcode", "companyTown", "companyState"):
        mark = "OK  " if parsed["present"].get(key) else "MISS"
        print("  %-4s %-18s %s" % (mark, key, parsed["fields"].get(key) or "-"))
    print("  Household        : %s" % (parsed["household"] or "-"))
    print("  Workplace        : %s" % parsed["bucketLabel"])

    if parsed["warnings"]:
        print("\nWarnings:")
        for warning in parsed["warnings"]:
            print("  - " + warning)

    if args.out:
        with open(args.out, "w", encoding="utf-8") as handle:
            json.dump(case, handle, indent=2)
        print("\nCase file written: %s" % args.out)
        print("Open the calculator -> Import case -> select this file.")

    if args.json:
        print("\n" + json.dumps(case, indent=2))


if __name__ == "__main__":
    main()
