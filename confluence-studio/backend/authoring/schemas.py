from pydantic import BaseModel, Field


class Source(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    data: str = Field(max_length=11200000)


class DraftRequest(BaseModel):
    instructions: str = Field(default='', max_length=12000)
    source: Source | None = None


class PreviewRequest(BaseModel):
    storage: str = Field(min_length=1, max_length=100000)
    image_names: list[str] = Field(default_factory=list, max_length=48)
    parent_id: str | None = Field(default=None, pattern=r'^[0-9]{1,20}$')
