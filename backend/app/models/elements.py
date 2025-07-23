# parsec-backend/app/models/elements.py
from pydantic import BaseModel, Field, conlist
from typing import Literal, Optional, List, Union, Dict, Any
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


class PathControlPoint(BaseModel):
    x: float
    y: float


class PathPoint(BaseModel):
    x: float
    y: float
    handleIn: Optional[PathControlPoint] = None
    handleOut: Optional[PathControlPoint] = None
    handleType: Literal["symmetrical", "asymmetrical", "disconnected"] = "symmetrical"


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
    element_type: Literal["text"] = "text"
    content: str = "Type something..."
    fontFamily: str = "Inter"
    fontSize: int = 16
    fontWeight: int = 400
    fontColor: str = "#000000"
    letterSpacing: float = 0
    lineHeight: float = 1.2
    align: Literal["left", "center", "right"] = "left"
    verticalAlign: Literal["top", "middle", "bottom"] = "top"
    width: float = Field(default=150)
    height: float = Field(default=22)


class FrameElement(Element):
    id: str = Field(default_factory=lambda: generate_id("frame"))
    element_type: Literal["frame"] = "frame"
    fill: Optional[Fill] = Field(default_factory=lambda: SolidFill(color="#FFFFFF"))
    stroke: Optional[Fill] = None
    strokeWidth: float = 1
    clipsContent: bool = True
    cornerRadius: float = 0
    # --- NEW FIELDS ---
    speakerNotes: str = Field(
        default="", description="Private notes for the presenter."
    )
    presentationOrder: Optional[int] = Field(
        default=None,
        description="The 0-based index of the frame in the presentation sequence. Null if not in presentation.",
    )


class PathElement(Element):
    id: str = Field(default_factory=lambda: generate_id("path"))
    element_type: Literal["path"] = "path"
    points: List[PathPoint]
    isClosed: bool = False
    fill: Optional[Fill] = Field(default_factory=SolidFill)
    stroke: Optional[Fill] = Field(default_factory=lambda: SolidFill(color="#333333"))
    strokeWidth: float = 1


class ImageElement(Element):
    id: str = Field(default_factory=lambda: generate_id("image"))
    element_type: Literal["image"] = "image"
    src: str
    prompt: Optional[str] = None
    width: float = 1024
    height: float = 1024


class Asset(BaseModel):
    """Represents a file asset stored in object storage."""

    id: str = Field(default_factory=lambda: generate_id("asset"))
    name: str  # The original filename, e.g., "logo.png"
    asset_type: Literal[
        "image",
        "pdf",
        "spreadsheet",
        "csv",
        "text",
        "presentation",
        "markdown",
        "other",
    ]
    mime_type: str  # The actual file MIME type, e.g., "image/png"
    url: str  # The permanent URL of the file in MinIO/S3


# --- NEW COMPONENT-RELATED MODELS ---


class ComponentProperty(BaseModel):
    """Defines a single customizable property within a component's schema."""

    prop_name: str  # e.g., "button_text", "user_avatar_src"
    target_element_id: (
        str  # The ID of the element within the template this property controls
    )
    target_property: str  # e.g., "content" for TextElement, "src" for ImageElement
    prop_type: Literal["text", "image_url", "color"] = "text"


class ComponentDefinition(BaseModel):
    """The master template for a component. This is NOT a canvas element itself."""

    id: str = Field(default_factory=lambda: generate_id("compdef"))
    name: str  # e.g., "User Profile Card"
    template_elements: List[Dict[str, Any]]  # Raw element data, not Pydantic models
    schema: List[ComponentProperty] = []


class ComponentInstanceElement(Element):
    """An actual instance of a component on the canvas. This IS a canvas element."""

    id: str = Field(default_factory=lambda: generate_id("compinst"))
    element_type: Literal["component_instance"] = "component_instance"
    definition_id: str
    properties: Dict[str, Any] = Field(default_factory=dict)


# --- UPDATED UNION TYPE ---
AnyElement = Union[
    ShapeElement,
    FrameElement,
    GroupElement,
    TextElement,
    PathElement,
    ImageElement,
    ComponentInstanceElement,  # <-- ADDED
]
