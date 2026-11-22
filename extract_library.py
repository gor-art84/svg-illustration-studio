"""Extract the editable object groups from the two Figma section SVG exports."""

import argparse
import json
from pathlib import Path
from xml.etree import ElementTree as ET

SVG = "{http://www.w3.org/2000/svg}"
OBJECTS = {
    "book": ("Книга", ("Книга", "Книга_2"), ("Книга", "Книга_2")),
    "phone": ("Телефон", ("Телефон", "Телефон_2"), ("Телефон", "Телефон_2")),
    "puzzle": ("Пазлы", ("Пазлы", "Пазлы_2"), ("Пазлы", "Пазлы_2")),
    "coin": ("Монета", ("Монета", "Монета_2"), ("Монета", "Монета_2")),
    "headphones": ("Наушники", ("Наушники", "Наушники_2"), ("Наушники", "Наушники_2")),
    "lamp": ("Лампа", ("Лампа", "Лампа_2"), ("Лампа", "Лампа_2")),
    "flowers": (
        "Цветы", ("Group 2136136345", "Group 2136136346"),
        ("Group 2136136344", "Group 2136136347"),
    ),
    "wallet": ("Кошелёк", ("Кошелек", "Кошелек_2"), ("Кошелек", "Кошелек_2")),
    "folder": ("Папка", ("Group 2136136337", "Group 2136136342"), ("Папка", "Папка_2")),
    "pen": ("Ручка", ("Group 2136136336", "Group 2136136343"), ("Ручка", "Ручка_2")),
}


def layer_name(element):
    name = element.get("id", "")
    # These Figma exports encode Cyrillic layer names as numeric entities for UTF-8 bytes.
    try:
        return name.encode("latin-1").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return name


def group_markup(group):
    for node in group.iter():
        if node.tag not in {SVG + "g", SVG + "path"}:
            raise ValueError(f"Unexpected SVG element in {layer_name(group)}: {node.tag}")
        if any("url(" in value or name.endswith("href") for name, value in node.attrib.items()):
            raise ValueError(f"Unexpected SVG reference in {layer_name(group)}")
        node.tag = node.tag.removeprefix(SVG)
        node.attrib.pop("id", None)
    return ET.tostring(group, encoding="unicode").strip()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("small", type=Path)
    parser.add_argument("large", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()

    entries = {key: {"name": name} for key, (name, *_layers) in OBJECTS.items()}
    for size, path, layer_index in (("S", args.small, 1), ("L", args.large, 2)):
        root = ET.parse(path).getroot()
        groups = {
            layer_name(group): group
            for section in root.findall(SVG + "g")
            for group in section.iter(SVG + "g")
        }
        for key, details in OBJECTS.items():
            primary, background = details[layer_index]
            entries[key][size] = {
                "primary": group_markup(groups[primary]),
                "background": group_markup(groups[background]),
            }

    args.output.write_text(
        "// Generated from the Figma S and L section exports by extract_library.py.\n"
        "const illustrationLibrary = " + json.dumps(entries, ensure_ascii=False, indent=2) + ";\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
