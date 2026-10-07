from dataclasses import dataclass
from typing import Optional


@dataclass
class Drawing:
    name: str
    image_url: str


@dataclass
class Creator:
    username: str
    number: int
    avatar_url: Optional[str]


@dataclass
class Outcome:
    outcome_id: int
    input_a: Drawing
    input_b: Drawing
    result: Drawing
    creator: Creator              # who created the outcome (the recipe)
    hearts: int
    created_text: str
    created_at: Optional[str]
    artist: Optional[Creator] = None  # who drew the result; often not the outcome creator
    drawn_text: str = ""
    drawn_at: Optional[str] = None
    browse_page: Optional[int] = None
