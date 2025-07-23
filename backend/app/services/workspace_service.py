# backend/app/services/workspace_service.py
import copy
from typing import Dict, Union, List, Optional, Tuple, Any
from loguru import logger
from ..models.elements import (
    Element,
    AnyElement,
    ShapeElement,
    GroupElement,
    TextElement,
    FrameElement,
    PathElement,
    ImageElement,
    ComponentDefinition,
    ComponentInstanceElement,
    ComponentProperty,
    Asset,
)


class WorkspaceService:
    def __init__(self):
        # CORE STATE
        self.elements: Dict[str, AnyElement] = {}
        self.component_definitions: Dict[str, ComponentDefinition] = {}
        self.assets: Dict[str, Asset] = {}
        self._next_z_index = 1

        # --- HISTORY MANAGEMENT STATE ---
        self.history: List[Dict[str, AnyElement]] = []
        self.history_index: int = -1

        logger.info("WorkspaceService initialized with Undo/Redo history.")
        # Commit the initial empty state as the first history entry
        self._commit_history()

    # ===================================================================
    # HISTORY & UNDO/REDO METHODS
    # ===================================================================

    def _commit_history(self):
        """
        Takes a snapshot of the current elements state and commits it to the history log.
        This invalidates any 'redo' states that might have existed.
        """
        if self.history_index < len(self.history) - 1:
            self.history = self.history[: self.history_index + 1]

        current_state_snapshot = copy.deepcopy(self.elements)
        self.history.append(current_state_snapshot)
        self.history_index += 1
        logger.info(
            f"Committed state to history. Index: {self.history_index}, Total States: {len(self.history)}"
        )

    def undo(self) -> Optional[Dict[str, AnyElement]]:
        """Restores the previous state from history."""
        if self.history_index > 0:
            self.history_index -= 1
            restored_state = self.history[self.history_index]
            self.elements = copy.deepcopy(restored_state)
            logger.info(
                f"Undo successful. Restored history state at index {self.history_index}."
            )
            return self.elements
        logger.warning("Undo failed: No previous history state available.")
        return None

    def redo(self) -> Optional[Dict[str, AnyElement]]:
        """Restores the next state from history."""
        if self.history_index < len(self.history) - 1:
            self.history_index += 1
            restored_state = self.history[self.history_index]
            self.elements = copy.deepcopy(restored_state)
            logger.info(
                f"Redo successful. Restored history state at index {self.history_index}."
            )
            return self.elements
        logger.warning("Redo failed: No future history state available.")
        return None

    # ===================================================================
    # NEW: ASSET MANAGEMENT METHODS
    # ===================================================================

    def create_asset(self, asset_data: Dict) -> Optional[Asset]:
        """Creates an asset metadata record."""
        try:
            asset = Asset(**asset_data)
            self.assets[asset.id] = asset
            logger.info(f"Asset metadata created for '{asset.name}' (ID: {asset.id})")
            return asset
        except Exception as e:
            logger.error(f"Failed to create asset metadata: {e}")
            return None

    def get_all_assets(self) -> List[Dict]:
        """Returns all asset metadata records."""
        return [asset.model_dump() for asset in self.assets.values()]

    def get_asset_by_id(self, asset_id: str) -> Optional[Asset]:
        """Retrieves a single asset by its ID."""
        return self.assets.get(asset_id)

    def delete_asset(self, asset_id: str) -> Optional[Asset]:
        """Deletes an asset metadata record and returns it."""
        if asset_id in self.assets:
            deleted_asset = self.assets.pop(asset_id)
            logger.info(f"Asset metadata deleted for ID: {asset_id}")
            return deleted_asset
        logger.warning(
            f"Attempted to delete non-existent asset metadata with ID: {asset_id}"
        )
        return None

    # ===================================================================
    # PUBLIC-FACING METHODS (These commit to history)
    # ===================================================================

    def update_element(
        self, element_id: str, updates: Dict, commit_history: bool = True
    ) -> Optional[AnyElement]:
        """Updates an element. `commit_history=False` debounces rapid events like dragging."""
        element = self.elements.get(element_id)
        if not element:
            return None

        updated_data = element.model_dump()
        updated_data.update(updates)
        updated_element = type(element)(**updated_data)
        self.elements[element_id] = updated_element

        if commit_history:
            self._commit_history()

        return updated_element

    def create_element_from_payload(self, payload: Dict) -> Optional[AnyElement]:
        """Public method to create a single element."""
        element = self._create_element_internal(payload)
        if element:
            self._commit_history()
            return element
        return None

    def create_elements_batch(self, payloads: List[Dict]) -> List[AnyElement]:
        """Public method to create a batch of elements (for paste)."""
        created_elements = [
            el for payload in payloads if (el := self._create_element_internal(payload))
        ]
        if created_elements:
            self._commit_history()
        return created_elements

    def delete_element(self, element_id: str) -> List[str]:
        """Public method to delete an element and its descendants."""
        deleted_ids = self._delete_element_internal(element_id)
        if deleted_ids:
            self._commit_history()
        return deleted_ids

    def group_elements(self, element_ids: List[str]) -> List[Element]:
        """Public method to group elements."""
        group, children = self._group_elements_internal(element_ids)
        if group:
            self._commit_history()
            return [group] + children
        return []

    def ungroup_elements(self, container_id: str) -> Tuple[List[Element], List[str]]:
        """Public method to ungroup elements from a group or frame."""
        released_children, deleted_ids = self._ungroup_elements_internal(container_id)
        if released_children or deleted_ids:
            self._commit_history()
        return released_children, deleted_ids

    def reparent_element(
        self, child_id: str, new_parent_id: Optional[str]
    ) -> List[Element]:
        """Public method to move an element to a new parent."""
        affected_elements = self._reparent_element_internal(child_id, new_parent_id)
        if affected_elements:
            self._commit_history()
        return affected_elements

    def reorder_element(self, element_id: str, command: str) -> List[AnyElement]:
        """Public method to reorder an element's z-index."""
        target_element = self.elements.get(element_id)
        if not target_element:
            return []

        if target_element.parentId:
            affected_elements = self._reorder_siblings(target_element, command)
        else:
            affected_elements = self._reorder_global(target_element, command)

        if affected_elements:
            self._commit_history()
        return affected_elements

    def update_presentation_order(self, payload: dict) -> List[AnyElement]:
        """Public method to update the presentation slide order."""
        affected_elements = self._update_presentation_order_internal(payload)
        if affected_elements:
            self._commit_history()
        return affected_elements

    def reorder_slide(
        self, dragged_id: str, target_id: str, position: str
    ) -> List[AnyElement]:
        """Public method to reorder a single slide within the presentation."""
        affected_elements = self._reorder_slide_internal(
            dragged_id, target_id, position
        )
        if affected_elements:
            self._commit_history()
        return affected_elements

    # ===================================================================
    # "READ-ONLY" PUBLIC METHODS
    # ===================================================================

    def get_all_elements(self) -> List[Dict]:
        return [element.model_dump() for element in self.elements.values()]

    def get_all_component_definitions(self) -> List[Dict]:
        return [
            definition.model_dump()
            for definition in self.component_definitions.values()
        ]

    def analyze_text_element(self, element_id: str) -> Optional[Dict]:
        """
        Retrieves specific properties of a TextElement for AI analysis.
        Returns a dictionary of text properties or None if the element is not found
        or is not a TextElement.
        """
        element = self.elements.get(element_id)
        if not isinstance(element, TextElement):
            logger.warning(
                f"Element {element_id} is not a TextElement or does not exist."
            )
            return None

        return {
            "id": element.id,
            "content": element.content,
            "fontFamily": element.fontFamily,
            "fontWeight": element.fontWeight,
            "fontSize": element.fontSize,
            "letterSpacing": element.letterSpacing,
            "lineHeight": element.lineHeight,
            # Potentially add color, alignment etc. if relevant for AI analysis
        }

    # ===================================================================
    # INTERNAL HELPER METHODS (These DO NOT commit to history)
    # ===================================================================

    def add_element(self, element: Element) -> None:
        """Helper to add an element and manage z-index."""
        element.zIndex = self._next_z_index
        self._next_z_index += 1
        self.elements[element.id] = element

    def _create_element_internal(self, payload: Dict) -> Optional[AnyElement]:
        element_type = payload.get("element_type")
        model_map = {
            "shape": ShapeElement,
            "text": TextElement,
            "frame": FrameElement,
            "image": ImageElement,
            "path": PathElement,
            "component_instance": ComponentInstanceElement,
        }
        element_model = model_map.get(element_type)
        if not element_model:
            return None
        try:
            new_element = element_model(**payload)
            self.add_element(new_element)
            return new_element
        except Exception as e:
            logger.exception(f"Failed to create Pydantic model: {e}")
            return None

    def _delete_element_internal(self, element_id: str) -> List[str]:
        if element_id not in self.elements:
            return []
        ids_to_delete = {element_id}
        q = [element_id]
        while q:
            parent_id = q.pop(0)
            children_ids = {
                el.id for el in self.elements.values() if el.parentId == parent_id
            }
            ids_to_delete.update(children_ids)
            q.extend(list(children_ids))

        deleted_ids = [an_id for an_id in ids_to_delete if an_id in self.elements]
        for an_id in deleted_ids:
            del self.elements[an_id]
        return deleted_ids

    def _group_elements_internal(
        self, element_ids: List[str]
    ) -> Tuple[Optional[GroupElement], List[Element]]:
        children = [
            self.elements.get(eid) for eid in element_ids if self.elements.get(eid)
        ]
        if not children:
            return None, []
        min_x = min(el.x for el in children)
        min_y = min(el.y for el in children)
        max_x = max(el.x + el.width for el in children)
        max_y = max(el.y + el.height for el in children)
        group = GroupElement(
            x=min_x, y=min_y, width=max_x - min_x, height=max_y - min_y
        )
        self.add_element(group)
        for child in children:
            child.parentId = group.id
            child.x -= group.x
            child.y -= group.y
        return group, children

    def _ungroup_elements_internal(
        self, container_id: str
    ) -> Tuple[List[Element], List[str]]:
        container = self.elements.get(container_id)
        if not container or container.element_type not in ["group", "frame"]:
            return [], []
        children = [el for el in self.elements.values() if el.parentId == container_id]
        if not children:
            del self.elements[container_id]
            return [], [container_id]
        for child in children:
            child.parentId = container.parentId
            child.x += container.x
            child.y += container.y
            child.zIndex = self._next_z_index
            self._next_z_index += 1
        del self.elements[container_id]
        return children, [container_id]

    def _reparent_element_internal(
        self, child_id: str, new_parent_id: Optional[str]
    ) -> List[Element]:
        child = self.elements.get(child_id)
        if not child:
            return []
        current_abs_x, current_abs_y = self._get_absolute_coords(child)
        new_parent_abs_x, new_parent_abs_y = 0, 0
        if new_parent_id:
            new_parent = self.elements.get(new_parent_id)
            if not new_parent or new_parent.element_type not in ["group", "frame"]:
                return []
            new_parent_abs_x, new_parent_abs_y = self._get_absolute_coords(new_parent)
        child.x = current_abs_x - new_parent_abs_x
        child.y = current_abs_y - new_parent_abs_y
        child.parentId = new_parent_id
        child.zIndex = self._next_z_index
        self._next_z_index += 1
        return [child]

    def _get_absolute_coords(self, element: Element) -> Tuple[float, float]:
        if element.parentId and element.parentId in self.elements:
            parent = self.elements[element.parentId]
            parent_x, parent_y = self._get_absolute_coords(parent)
            return element.x + parent_x, element.y + parent_y
        return element.x, element.y

    def _reorder_global(
        self, target_element: AnyElement, command: str
    ) -> List[AnyElement]:
        all_elements = sorted(self.elements.values(), key=lambda el: el.zIndex)
        try:
            current_index = all_elements.index(target_element)
        except ValueError:
            return []
        all_elements.pop(current_index)
        if command == "BRING_FORWARD":
            all_elements.insert(
                min(current_index + 1, len(all_elements)), target_element
            )
        elif command == "SEND_BACKWARD":
            all_elements.insert(max(current_index - 1, 0), target_element)
        elif command == "BRING_TO_FRONT":
            all_elements.append(target_element)
        elif command == "SEND_TO_BACK":
            all_elements.insert(0, target_element)
        else:
            return []
        for i, element in enumerate(all_elements):
            element.zIndex = i
        self._next_z_index = len(all_elements)
        return all_elements

    def _reorder_siblings(
        self, target_element: AnyElement, command: str
    ) -> List[AnyElement]:
        siblings = sorted(
            [
                el
                for el in self.elements.values()
                if el.parentId == target_element.parentId
            ],
            key=lambda el: el.zIndex,
        )
        try:
            current_index = siblings.index(target_element)
        except ValueError:
            return []
        siblings.pop(current_index)
        if command in ["BRING_FORWARD", "BRING_TO_FRONT"]:
            siblings.insert(min(current_index + 1, len(siblings)), target_element)
        elif command in ["SEND_BACKWARD", "SEND_TO_BACK"]:
            siblings.insert(max(current_index - 1, 0), target_element)
        else:
            return []
        parent = self.elements.get(target_element.parentId)
        base_z = parent.zIndex + 1 if parent else 0
        for i, sibling in enumerate(siblings):
            sibling.zIndex = base_z + i
        self._next_z_index = max(self._next_z_index, base_z + len(siblings))
        return siblings

    def _update_presentation_order_internal(self, payload: dict) -> List[AnyElement]:
        action = payload.get("action")
        if action == "set":
            ordered_frame_ids = payload.get("ordered_frame_ids", [])
            return self._set_presentation_order(ordered_frame_ids)
        elif action == "add":
            frame_id_to_add = payload.get("frame_id")
            if not frame_id_to_add:
                return []
            current_slides = sorted(
                [
                    el
                    for el in self.elements.values()
                    if isinstance(el, FrameElement) and el.presentationOrder is not None
                ],
                key=lambda el: el.presentationOrder,
            )
            new_ordered_ids = [s.id for s in current_slides]
            if frame_id_to_add not in new_ordered_ids:
                new_ordered_ids.append(frame_id_to_add)
            return self._set_presentation_order(new_ordered_ids)
        return []

    def _set_presentation_order(self, ordered_frame_ids: List[str]) -> List[AnyElement]:
        elements_to_broadcast = []
        ids_in_new_presentation = set(ordered_frame_ids)
        for element in self.elements.values():
            if isinstance(element, FrameElement):
                if element.id in ids_in_new_presentation:
                    element.presentationOrder = ordered_frame_ids.index(element.id)
                    elements_to_broadcast.append(element)
                elif element.presentationOrder is not None:
                    element.presentationOrder = None
                    elements_to_broadcast.append(element)
        return elements_to_broadcast

    def _reorder_slide_internal(
        self, dragged_id: str, target_id: str, position: str
    ) -> List[AnyElement]:
        current_slides = sorted(
            [
                el
                for el in self.elements.values()
                if isinstance(el, FrameElement) and el.presentationOrder is not None
            ],
            key=lambda el: el.presentationOrder,
        )
        dragged_element = next(
            (el for el in current_slides if el.id == dragged_id), None
        )
        if not dragged_element:
            return []
        current_slides.remove(dragged_element)
        try:
            target_index = current_slides.index(
                next(el for el in current_slides if el.id == target_id)
            )
            if position == "below":
                current_slides.insert(target_index + 1, dragged_element)
            else:
                current_slides.insert(target_index, dragged_element)
        except (StopIteration, ValueError):
            return []
        return self._set_presentation_order([s.id for s in current_slides])

    def get_text_element_properties(self, element_id: str) -> Optional[Dict]:
        """
        Retrieves specific properties of a TextElement for AI analysis.
        Returns a dictionary of text properties or None if the element is not found
        or is not a TextElement.
        """
        element = self.elements.get(element_id)
        if not isinstance(element, TextElement):
            logger.warning(
                f"Attempted to analyze non-TextElement or non-existent element: {element_id}"
            )
            return None

        return {
            "id": element.id,
            "content": element.content,
            "fontFamily": element.fontFamily,
            "fontWeight": element.fontWeight,
            "fontSize": element.fontSize,
            "letterSpacing": element.letterSpacing,
            "lineHeight": element.lineHeight,
            "textAlign": element.textAlign,  # Added textAlign as it's a common text property
        }

    # ===================================================================
    # NEW METHODS FOR AI CONTENT CRAFTER AGENT
    # ===================================================================

    # Method for update_text_element_content
    def update_text_content(
        self, element_id: str, new_text: str
    ) -> Optional[AnyElement]:
        """
        Updates the content of a TextElement. This method DOES NOT commit history.
        It's intended for internal agent use where AgentService manages the commit.
        """
        # We use the generic update_element method, ensuring the 'content' key is passed.
        # The update_element method handles validation but *not* history commit here.
        updates = {"content": new_text}
        updated_element = self.update_element(
            element_id, updates, commit_history=False
        )  # Important: commit_history=False
        return updated_element

    def get_text_element_content(self, element_id: str) -> Optional[str]:
        """
        Retrieves the content of a TextElement by its ID.
        """
        element = self.elements.get(element_id)
        if isinstance(element, TextElement):
            return element.content
        logger.warning(f"Element {element_id} is not a TextElement or does not exist.")
        return None

    def create_component_from_elements(
        self, name: str, source_element_ids: List[str], schema: List[Dict[str, Any]]
    ) -> Tuple[
        Optional[ComponentDefinition], Optional[ComponentInstanceElement], List[str]
    ]:
        """
        Creates a component definition and an instance from a set of source elements.
        This is a transactional operation.
        Returns (new_definition, new_instance, deleted_ids).
        """
        source_elements = [
            self.elements.get(eid)
            for eid in source_element_ids
            if self.elements.get(eid)
        ]
        if not source_elements:
            logger.error("Component creation failed: No valid source elements found.")
            return None, None, []

        # 1. Calculate the bounding box of the source elements.
        # This will become the frame for the new component instance.
        min_x = min(el.x for el in source_elements)
        min_y = min(el.y for el in source_elements)
        max_x = max(el.x + el.width for el in source_elements)
        max_y = max(el.y + el.height for el in source_elements)
        comp_x, comp_y = min_x, min_y
        comp_width, comp_height = max_x - min_x, max_y - min_y

        # 2. Create the template with element positions relative to the new component's origin.
        template_elements_data = []
        for el in source_elements:
            el_copy = el.model_copy()
            el_copy.x -= comp_x
            el_copy.y -= comp_y
            template_elements_data.append(el_copy.model_dump())

        # 3. Create and register the ComponentDefinition (the "blueprint").
        try:
            parsed_schema = [ComponentProperty(**s) for s in schema]
            new_definition = ComponentDefinition(
                name=name,
                template_elements=template_elements_data,
                schema=parsed_schema,
            )
            self.component_definitions[new_definition.id] = new_definition
        except Exception as e:
            logger.exception(f"Failed to create component definition: {e}")
            return None, None, []

        # 4. Create the first ComponentInstanceElement on the canvas.
        instance_payload = {
            "element_type": "component_instance",
            "definition_id": new_definition.id,
            "x": comp_x,
            "y": comp_y,
            "width": comp_width,
            "height": comp_height,
            "properties": {},  # Properties can be populated later
        }
        new_instance = self.create_element_from_payload(instance_payload)
        if not new_instance:
            # Rollback if instance creation fails
            del self.component_definitions[new_definition.id]
            return None, None, []

        # 5. Delete the original source elements.
        deleted_ids = []
        for an_id in source_element_ids:
            deleted_ids.extend(self._delete_element_internal(an_id))

        logger.success(
            f"Successfully created component '{name}' and deleted {len(deleted_ids)} source elements."
        )
        return new_definition, new_instance, deleted_ids
