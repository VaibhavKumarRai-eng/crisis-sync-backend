from copy import deepcopy

from bson import ObjectId
from pymongo.errors import DuplicateKeyError


class InsertOneResult:
    def __init__(self, inserted_id: ObjectId) -> None:
        self.inserted_id = inserted_id


class AsyncCursor:
    def __init__(self, documents: list[dict]) -> None:
        self.documents = documents

    def sort(self, key_or_list, direction: int | None = None):
        if isinstance(key_or_list, list):
            key, direction = key_or_list[0]
        else:
            key = key_or_list
        reverse = direction == -1
        self.documents.sort(key=lambda item: item.get(key), reverse=reverse)
        return self

    def skip(self, count: int):
        self.documents = self.documents[count:]
        return self

    def limit(self, count: int):
        self.documents = self.documents[:count]
        return self

    def __aiter__(self):
        self._index = 0
        return self

    async def __anext__(self):
        if self._index >= len(self.documents):
            raise StopAsyncIteration
        document = self.documents[self._index]
        self._index += 1
        return deepcopy(document)


class FakeCollection:
    def __init__(self) -> None:
        self.documents: list[dict] = []
        self.unique_indexes: set[str] = set()

    async def create_index(self, keys, unique: bool = False):
        if unique and isinstance(keys, str):
            self.unique_indexes.add(keys)
        return keys

    async def insert_one(self, document: dict) -> InsertOneResult:
        for field in self.unique_indexes:
            if any(existing.get(field) == document.get(field) for existing in self.documents):
                raise DuplicateKeyError(f"duplicate key: {field}")
        inserted = deepcopy(document)
        inserted["_id"] = inserted.get("_id", ObjectId())
        self.documents.append(inserted)
        return InsertOneResult(inserted["_id"])

    async def find_one(self, query: dict) -> dict | None:
        for document in self.documents:
            if self._matches(document, query):
                return deepcopy(document)
        return None

    def find(self, query: dict):
        return AsyncCursor([deepcopy(document) for document in self.documents if self._matches(document, query)])

    async def count_documents(self, query: dict) -> int:
        return sum(1 for document in self.documents if self._matches(document, query))

    async def find_one_and_update(self, query: dict, update: dict, return_document=None) -> dict | None:
        for document in self.documents:
            if self._matches(document, query):
                document.update(update.get("$set", {}))
                for field, value in update.get("$push", {}).items():
                    document.setdefault(field, []).append(value)
                return deepcopy(document)
        return None

    def _matches(self, document: dict, query: dict) -> bool:
        for key, expected in query.items():
            actual = document.get(key)
            if isinstance(expected, dict) and "$in" in expected:
                if actual not in expected["$in"]:
                    return False
            elif actual != expected:
                return False
        return True


class FakeDatabase:
    def __init__(self) -> None:
        self.collections: dict[str, FakeCollection] = {}

    def __getitem__(self, name: str) -> FakeCollection:
        if name not in self.collections:
            self.collections[name] = FakeCollection()
        return self.collections[name]
