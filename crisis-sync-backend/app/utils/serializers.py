from copy import deepcopy


def serialize_document(document: dict | None, *, drop_fields: set[str] | None = None) -> dict | None:
    if not document:
        return None
    serialized = deepcopy(document)
    serialized["id"] = str(serialized.pop("_id"))
    for field in drop_fields or set():
        serialized.pop(field, None)
    return serialized
