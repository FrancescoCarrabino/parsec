# parsec-backend/app/models/elements.py
from pydantic import BaseModel, Field, conlist
from typing import Literal, Optional, List, Union
from typing_extensions import Annotated
import uuid


def generate_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:8]}"


class SolidFill(BaseModel):
    type: Literal["solid"] = "solid"
    color: str = "#ffffff"


class GradientStop(BaseModel):
    color: str
    offset: float


class LinearGradientFill(BaseModel):
    type: Literal["linear-gradient"] = "linear-gradient"
    angle: int = 90
    stops: conlist(GradientStop, min_length=2) = [
        GradientStop(color="#ff0000", offset=0),
        GradientStop(color="#0000ff", offset=1),
    ]


Fill = Annotated[Union[SolidFill, LinearGradientFill], Field(discriminator="type")]


class Element(BaseModel):
    id: str
    element_type: str
    x: float
    y: float
    rotation: float = 0
    width: float = 100
    height: float = 100
    zIndex: int = 0
    isVisible: bool = True
    parentId: Optional[str] = None
    name: str = ""


# --- NEW: Path point models ---
class PathControlPoint(BaseModel):
    x: float
    y: float


class PathPoint(BaseModel):
    x: float
    y: float
    handleIn: Optional[PathControlPoint] = None
    handleOut: Optional[PathControlPoint] = None
    handleType: Literal["symmetrical", "asymmetrical", "disconnected"] = "symmetrical"


# --- UPDATED element models ---
class ShapeElement(Element):
    id: str = Field(default_factory=lambda: generate_id("shape"))
    element_type: Literal["shape"] = "shape"
    shape_type: Literal["rect", "circle", "ellipse"]
    fill: Optional[Fill] = Field(default_factory=SolidFill)
    stroke: Optional[Fill] = None
    strokeWidth: float = 1
    cornerRadius: float = 0


class GroupElement(Element):
    id: str = Field(default_factory=lambda: generate_id("group"))
    element_type: Literal["group"] = "group"


class TextElement(Element):
    id: str = Field(default_factory=lambda: generate_id("text"))
    element_type: Literal["text"]
    content: str = "Type something..."
    fontFamily: str = "Inter"
    fontSize: int = 16
    fontColor: str = "#000000"
    align: Literal["left", "center", "right"] = "left"
    verticalAlign: Literal["top", "middle", "bottom"] = "top"
    width: float = Field(default=150)
    height: float = Field(default=22)


class FrameElement(Element):
    id: str = Field(default_factory=lambda: generate_id("frame"))
    element_type: Literal["frame"] = "frame"
    fill: Optional[Fill] = Field(default_factory=SolidFill)
    stroke: Optional[Fill] = Field(default_factory=lambda: SolidFill(color="#888888"))
    strokeWidth: float = 1
    clipsContent: bool = True
    cornerRadius: float = 0


class PathElement(Element):
    id: str = Field(default_factory=lambda: generate_id("path"))
    element_type: Literal["path"] = "path"
    points: List[PathPoint]
    isClosed: bool = False
    fill: Optional[Fill] = Field(default_factory=SolidFill)
    stroke: Optional[Fill] = Field(default_factory=lambda: SolidFill(color="#333333"))
    strokeWidth: float = 1


AnyElement = Union[ShapeElement, FrameElement, GroupElement, TextElement, PathElement]
