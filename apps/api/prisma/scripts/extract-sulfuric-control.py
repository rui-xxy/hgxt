"""Extract the dated sulfuric analysis sheet without relying on row order or display formatting.

Usage: python extract-sulfuric-control.py SOURCE.xlsx SCHEMA.json DATA.json
The two generated files are reviewed and committed; the application never reads Excel at runtime.
"""

import json
import sys
from datetime import date, datetime
from pathlib import Path

import openpyxl
from openpyxl.utils import get_column_letter


def section_for(column):
    if 2 <= column <= 26:
        return "矿样·干吸·风机", "矿样"
    if 27 <= column <= 36:
        return "动力波·水洗塔", "动力波"
    if 37 <= column <= 41:
        return "矿样·干吸·风机", "干吸酸浓"
    if 42 <= column <= 43:
        return "预干燥·酸浓缩·尾吸·试剂酸", "预干燥塔"
    if 44 <= column <= 45:
        return "预干燥·酸浓缩·尾吸·试剂酸", "酸浓缩"
    if 46 <= column <= 47:
        return "动力波·水洗塔", "水洗塔"
    if 48 <= column <= 49:
        return "预干燥·酸浓缩·尾吸·试剂酸", "尾吸塔"
    if 50 <= column <= 53:
        return "预干燥·酸浓缩·尾吸·试剂酸", "试剂酸"
    return "矿样·干吸·风机", "风机出口"


def main(source, schema_path, data_path):
    sheet = openpyxl.load_workbook(source, read_only=True, data_only=True).active
    rows = sheet.iter_rows(values_only=True)
    next(rows)  # workbook title
    groups = next(rows)
    labels = next(rows)
    by_date = {}
    used = set()
    mixed = set()
    for source_row, row in enumerate(rows, 4):
        raw_date = row[0]
        if not isinstance(raw_date, (date, datetime)) or raw_date.year not in (2025, 2026):
            continue
        date_key = raw_date.strftime("%Y-%m-%d")
        if date_key in by_date:
            raise ValueError(f"duplicate date {date_key}, row {source_row}")
        values = {}
        for col in range(2, 64):  # B:BK; BL is a repeated date, never a metric
            value = row[col - 1]
            if value is None or value == "":
                continue
            letter = get_column_letter(col)
            if isinstance(value, (datetime, date)):
                value = value.isoformat()
            elif not isinstance(value, (int, float, str)):
                value = str(value)
            if isinstance(value, float) and not (float("-inf") < value < float("inf")):
                raise ValueError(f"nonfinite value {date_key} {letter}")
            values[f"field_{letter}"] = value
            used.add(col)
            if isinstance(value, str):
                mixed.add(col)
        notes = [str(value).strip() for value in row[64:82] if value is not None and str(value).strip()]
        if notes:
            values["field_notes"] = "\n".join(notes)
        if not values:
            continue  # the workbook has prefilled future dates without measurements
        by_date[date_key] = {"date": date_key, "sourceRow": source_row, "values": values}

    schema = [{"id": "field_date", "title": "日期", "type": "date", "required": True, "group": "矿样·干吸·风机", "hidden": True}]
    current_header = ""
    for col in range(2, 64):
        if groups[col - 1] is not None:
            current_header = str(groups[col - 1]).strip()
        if col not in used:
            continue
        letter = get_column_letter(col)
        group, section = section_for(col)
        label = str(labels[col - 1]).strip() if labels[col - 1] is not None else ""
        title = label or (current_header if groups[col - 1] is not None else f"未命名列 {letter}")
        field = {"id": f"field_{letter}", "title": title, "type": "text" if col in mixed else "number",
                 "group": group, "section": section, "subgroup": current_header or section,
                 "width": 170 if col in mixed else 136}
        if col not in mixed:
            field["step"] = 0.01
        schema.append(field)
    schema.append({"id": "field_notes", "title": "生产情况记录", "type": "text", "group": "生产情况记录",
                   "section": "生产情况记录", "subgroup": "生产情况记录", "width": 440})
    section_order = ["矿样", "干吸酸浓", "风机出口", "动力波", "水洗塔",
                     "预干燥塔", "酸浓缩", "尾吸塔", "试剂酸"]
    fan_order = ["field_BB", "field_BD", "field_BE", "field_BG", "field_BH", "field_BC", "field_BI"]
    source_position = {field["id"]: index for index, field in enumerate(schema)}
    schema[1:-1] = sorted(schema[1:-1], key=lambda field: (
        section_order.index(field["section"]),
        fan_order.index(field["id"]) if field["id"] in fan_order else source_position[field["id"]],
    ))
    data = {"source": Path(source).name, "from": min(by_date), "to": max(by_date),
            "rows": [by_date[key] for key in sorted(by_date)]}
    schema_file = Path(schema_path)
    schema_file.write_text(json.dumps(schema, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    parts = {
        "sulfuric-control-assay.json": {"矿样·干吸·风机"},
        "sulfuric-control-washing.json": {"动力波·水洗塔"},
        "sulfuric-control-acid.json": {"预干燥·酸浓缩·尾吸·试剂酸"},
        "sulfuric-control-notes.json": {"生产情况记录"},
    }
    for filename, part_groups in parts.items():
        fields = [schema[0]] + [field for field in schema[1:] if field["group"] in part_groups]
        schema_file.with_name(filename).write_text(json.dumps(fields, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    Path(data_path).write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{len(data['rows'])} dated rows, {len(schema)} fields, {data['from']} to {data['to']}")


if __name__ == "__main__":
    main(*sys.argv[1:])
