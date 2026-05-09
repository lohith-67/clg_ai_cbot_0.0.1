"""
SNPSU PDF Ingestion Pipeline
─────────────────────────────────────────────────────────────────
Drop any college PDF into /uploads → run this script → 
structured text is merged into college_knowledge.json
─────────────────────────────────────────────────────────────────
Usage:
    python ingest_pdfs.py                    # Process all PDFs in /uploads
    python ingest_pdfs.py --file timetable.pdf  # Process one file
    python ingest_pdfs.py --preview          # Print extracted text only
"""

import os
import sys
import json
import re
import argparse
from pathlib import Path
from datetime import datetime

try:
    import pdfplumber
except ImportError:
    print("❌ Missing dependency. Run:")
    print("   pip install pdfplumber")
    sys.exit(1)

# ── Paths ──────────────────────────────────────────────────────
BASE_DIR      = Path(__file__).parent.parent
UPLOADS_DIR   = BASE_DIR / "uploads"
PROCESSED_DIR = BASE_DIR / "processed"
KB_PATH       = BASE_DIR / "backend" / "data" / "college_knowledge.json"
# Fallback: save next to this script if backend not found
if not KB_PATH.parent.exists():
    KB_PATH = BASE_DIR / "college_knowledge.json"

UPLOADS_DIR.mkdir(exist_ok=True)
PROCESSED_DIR.mkdir(exist_ok=True)


# ── PDF Category Detector ──────────────────────────────────────
def detect_category(filename: str, text_sample: str) -> str:
    """
    Guesses what kind of college document this is based on
    filename and first 500 chars of text.
    """
    combined = (filename + " " + text_sample).lower()

    rules = [
        (["timetable", "time table", "schedule", "class schedule"], "timetable"),
        (["exam", "examination", "internal assessment", "end semester", "seating"], "exam_schedule"),
        (["event", "fest", "workshop", "seminar", "symposium", "hackathon", "cultural"], "events"),
        (["fee", "fees", "payment", "tuition", "challan"], "fee_structure"),
        (["placement", "recruit", "campus drive", "offer letter", "package"], "placement"),
        (["syllabus", "curriculum", "course outline", "units", "module"], "syllabus"),
        (["hostel", "accommodation", "boarding", "mess", "warden"], "hostel"),
        (["library", "books", "catalogue", "borrowing", "digital resource"], "library"),
        (["rule", "regulation", "discipline", "code of conduct", "policy"], "rules_regulations"),
        (["holiday", "vacation", "leave", "academic calendar"], "academic_calendar"),
        (["club", "association", "committee", "nss", "ieee"], "clubs"),
        (["admission", "apply", "eligibility", "application form"], "admissions"),
        (["faculty", "staff", "professor", "hod", "department"], "faculty"),
        (["result", "grade", "marks", "cgpa", "sgpa", "transcript"], "results_info"),
        (["transport", "bus", "route", "pick up", "drop"], "transport"),
    ]

    for keywords, category in rules:
        if any(kw in combined for kw in keywords):
            return category

    return "general"


# ── Text Extractor ─────────────────────────────────────────────
def extract_text_from_pdf(pdf_path: Path) -> dict:
    """
    Extracts all text and tables from a PDF.
    Returns a dict with: raw_text, tables, page_count, category
    """
    print(f"\n📄 Processing: {pdf_path.name}")

    result = {
        "filename": pdf_path.name,
        "raw_text": "",
        "tables": [],
        "page_count": 0,
        "category": "general",
        "extracted_at": datetime.now().isoformat(),
    }

    try:
        with pdfplumber.open(pdf_path) as pdf:
            result["page_count"] = len(pdf.pages)
            all_text = []
            all_tables = []

            for i, page in enumerate(pdf.pages):
                print(f"   Page {i+1}/{len(pdf.pages)}...", end="\r")

                # ── Extract tables first (more structured) ──────
                tables = page.extract_tables()
                if tables:
                    for tbl in tables:
                        if tbl and any(any(cell for cell in row) for row in tbl):
                            all_tables.append({
                                "page": i + 1,
                                "data": [[str(c).strip() if c else "" for c in row] for row in tbl]
                            })

                # ── Extract text ────────────────────────────────
                text = page.extract_text(x_tolerance=3, y_tolerance=3)
                if text:
                    all_text.append(f"[Page {i+1}]\n{text.strip()}")

            result["raw_text"]  = "\n\n".join(all_text)
            result["tables"]    = all_tables

            # Detect category from filename + first 500 chars
            result["category"] = detect_category(
                pdf_path.stem,
                result["raw_text"][:500]
            )

            print(f"   ✅ Done: {len(pdf.pages)} pages, {len(all_tables)} tables, "
                  f"category='{result['category']}'")

    except Exception as e:
        print(f"   ❌ Error reading {pdf_path.name}: {e}")
        result["error"] = str(e)

    return result


# ── Text → Structured Dict Converter ──────────────────────────
def structure_extracted_data(extracted: dict) -> dict:
    """
    Takes raw extracted text + tables and returns a clean dict
    that will be merged into college_knowledge.json
    """
    category = extracted["category"]
    raw      = extracted["raw_text"]
    tables   = extracted["tables"]
    filename = extracted["filename"]

    # Generic fallback structure
    structured = {
        "_source_file": filename,
        "_extracted_at": extracted["extracted_at"],
        "_pages": extracted["page_count"],
        "content": raw,
    }

    # ── Timetable: try to parse day → subject mapping ─────────
    if category == "timetable":
        days = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]
        schedule = {}
        for day in days:
            lookahead = "|".join(days)
            pattern = day + r"[:\s]+(.*?)(?=" + lookahead + r"|$)"
            match = re.search(pattern, raw, re.IGNORECASE | re.DOTALL)
            if match:
                schedule[day] = match.group(1).strip()[:300]
        if tables:
            schedule["_tables"] = tables
        structured["schedule"] = schedule if schedule else {"_raw": raw, "_tables": tables}

    # ── Exam: keep raw + any tables ──────────────────────────
    elif category == "exam_schedule":
        structured["schedule_details"] = raw
        if tables:
            structured["exam_tables"] = tables

    # ── Events: extract event name + date patterns ────────────
    elif category == "events":
        event_blocks = re.findall(
            r'([A-Z][A-Za-z\s\-\d]{3,60})\s*[:\-–]\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\w+ \d{1,2}[,\s]+\d{4})',
            raw
        )
        parsed_events = [{"name": n.strip(), "date": d.strip()} for n, d in event_blocks]
        structured["events_list"] = parsed_events if parsed_events else []
        structured["full_content"] = raw

    # ── Fee structure: find amounts ────────────────────────────
    elif category == "fee_structure":
        fee_patterns = re.findall(r'([A-Za-z\s\/\-]{4,50})[:\s]+[₹Rs\.]*\s*([\d,]+(?:\.\d+)?)', raw)
        structured["fee_items"] = [{"item": k.strip(), "amount": v.strip()} for k, v in fee_patterns]
        structured["full_content"] = raw
        if tables:
            structured["fee_tables"] = tables

    # ── Faculty: extract name + designation patterns ───────────
    elif category == "faculty":
        faculty_list = re.findall(
            r'((?:Dr\.|Prof\.|Mr\.|Ms\.|Mrs\.)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)',
            raw
        )
        structured["faculty_list"] = list(set(faculty_list))
        structured["full_content"] = raw

    else:
        structured["full_content"] = raw
        if tables:
            structured["tables"] = tables

    return {category: structured}


# ── Knowledge Base Merger ──────────────────────────────────────
def merge_into_knowledge_base(new_data: dict, kb_path: Path) -> None:
    """
    Merges new structured data into the existing college_knowledge.json.
    Existing keys are NOT overwritten — new data is nested under _pdf_data.
    """
    kb = {}
    if kb_path.exists():
        with open(kb_path, "r", encoding="utf-8") as f:
            kb = json.load(f)

    if "_pdf_data" not in kb:
        kb["_pdf_data"] = {}

    for category, data in new_data.items():
        if category not in kb["_pdf_data"]:
            kb["_pdf_data"][category] = []

        # Avoid duplicate insertions
        source = data.get("_source_file", "")
        existing_sources = [d.get("_source_file","") for d in kb["_pdf_data"][category]]
        if source in existing_sources:
            print(f"   ⚠️  {source} already in knowledge base — skipping merge")
            continue

        kb["_pdf_data"][category].append(data)
        print(f"   ✅ Merged into knowledge base → section: '{category}'")

    with open(kb_path, "w", encoding="utf-8") as f:
        json.dump(kb, f, indent=2, ensure_ascii=False)

    print(f"\n💾 Knowledge base saved to: {kb_path}")


# ── Save processed text for review ────────────────────────────
def save_processed(extracted: dict) -> None:
    out = PROCESSED_DIR / (Path(extracted["filename"]).stem + "_extracted.txt")
    with open(out, "w", encoding="utf-8") as f:
        f.write(f"=== Extracted from: {extracted['filename']} ===\n")
        f.write(f"Category: {extracted['category']}\n")
        f.write(f"Pages: {extracted['page_count']}\n")
        f.write(f"Extracted: {extracted['extracted_at']}\n\n")
        f.write("─── TEXT ───\n")
        f.write(extracted["raw_text"])
        if extracted.get("tables"):
            f.write("\n\n─── TABLES ───\n")
            for t in extracted["tables"]:
                f.write(f"\n[Page {t['page']}]\n")
                for row in t["data"]:
                    f.write(" | ".join(row) + "\n")
    print(f"   📝 Preview saved → {out}")


# ── Main ───────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="SNPSU PDF Ingestion Pipeline")
    parser.add_argument("--file", help="Process a single PDF file")
    parser.add_argument("--preview", action="store_true", help="Print extracted text only, don't update KB")
    parser.add_argument("--uploads-dir", default=str(UPLOADS_DIR), help="Directory with PDFs to process")
    args = parser.parse_args()

    uploads = Path(args.uploads_dir)
    uploads.mkdir(exist_ok=True)

    # Determine which files to process
    if args.file:
        file_path = Path(args.file)
        if not file_path.exists():
            print(f"\n❌ File not found: {file_path}")
            return
        pdf_files = [file_path]
    else:
        # Use a set to avoid duplicates on case-insensitive filesystems (Windows)
        pdf_files = list({p.resolve() for p in uploads.glob("*.pdf")} | {p.resolve() for p in uploads.glob("*.PDF")})

    if not pdf_files:
        print(f"\n⚠️  No PDF files found in {uploads}")
        print("   Drop your college PDFs into the 'uploads/' folder and run again.\n")
        return

    print(f"\n🎓 SNPSU PDF Ingestion Pipeline")
    print(f"   Found {len(pdf_files)} PDF(s) to process\n")
    print("─" * 60)

    for pdf_path in pdf_files:
        extracted = extract_text_from_pdf(pdf_path)

        if "error" in extracted:
            continue

        save_processed(extracted)

        if args.preview:
            print("\n" + "─"*40)
            print(extracted["raw_text"][:2000])
            print("─"*40)
            continue

        structured = structure_extracted_data(extracted)
        merge_into_knowledge_base(structured, KB_PATH)

    print("\n" + "─" * 60)
    print(f"✅ All done! Knowledge base: {KB_PATH}")
    print(f"   The chatbot will use this data for all future answers.\n")


if __name__ == "__main__":
    main()
