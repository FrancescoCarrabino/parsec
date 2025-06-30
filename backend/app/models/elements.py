from pydantic import BaseModel, Field, conlist
from typing import Literal, Optional, List, Union
from typing_extensions import Annotated
import uuid


def generate_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:8]}"


# --- NEW FILL MODELS ---
class SolidFill(BaseModel):
    type: Literal["solid"] = "solid"
    color: str = "#ffffff"


class GradientStop(BaseModel):
    color: str
    offset: float  # 0 to 1


class LinearGradientFill(BaseModel):
    type: Literal["linear-gradient"] = "linear-gradient"
    angle: int = 90  # In degrees
    stops: conlist(GradientStop, min_length=2) = [
        GradientStop(color="#ff0000", offset=0),
        GradientStop(color="#0000ff", offset=1),
    ]


# A tagged union to represent any possible fill type
Fill = Annotated[Union[SolidFill, LinearGradientFill], Field(discriminator="type")]
# --------------------


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


class ShapeElement(Element):
    id: str = Field(default_factory=lambda: generate_id("shape"))
    element_type: Literal["shape"] = "shape"
    shape_type: Literal["rect", "circle"]
    # The 'fill' property is now a complex object, defaulting to solid white.
    fill: Fill = Field(default_factory=SolidFill)
    stroke: str = "black"
    stroke_width: int = 0


class GroupElement(Element):
    id: str = Field(default_factory=lambda: generate_id("group"))
    element_type: Literal["group"] = "group"


AnyElement = Union[ShapeElement, GroupElement]
