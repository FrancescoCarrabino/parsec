from typing import Dict, Union, List, Optional, Tuple
from loguru import logger
from ..models.elements import (
    Element,
    AnyElement, # IMPORT AnyElement to correctly type the elements dictionary
    ShapeElement,
    GroupElement,
    TextElement,
    FrameElement,
    PathElement,
    ImageElement,
    ComponentDefinition,  # NEW: Import ComponentDefinition
    ComponentInstanceElement, # NEW: Import ComponentInstanceElement
    ComponentProperty, # NEW: Import ComponentProperty
)


class WorkspaceService:
    def __init__(self):
        # The elements dict is now correctly typed with AnyElement
        self.elements: Dict[str, AnyElement] = {}
        # NEW: Add a registry for component definitions
        self.component_definitions: Dict[str, ComponentDefinition] = {}
        self._next_z_index = 1
        logger.info("WorkspaceService initialized with Component Definition Registry.")

    # --- No changes to add_element, update_element ---
    def add_element(self, element: Element) -> None:
        """Adds a new element and assigns it the highest z-index."""
        element.zIndex = self._next_z_index
        self._next_z_index += 1
        self.elements[element.id] = element
        logger.info(f"Element added: {element.id} with zIndex {element.zIndex}")

    def update_element(self, element_id: str, updates: Dict) -> Optional[AnyElement]:
        element = self.elements.get(element_id)
        if not element:
            logger.warning(
                f"Attempted to update non-existent element: {element_id}"
            )
            return None

        # Pydantic v2 requires that we use model_validate to apply updates to a union type
        updated_data = element.model_dump()
        updated_data.update(updates)

        # Re-validate the data against the correct model type
        updated_element = type(element)(**updated_data)

        self.elements[element_id] = updated_element
        logger.debug(f"Element updated: {element_id} with data {updates}")
        return updated_element


    def get_all_elements(self) -> List[Dict]:
        return [element.model_dump() for element in self.elements.values()]

    # NEW: Method to get all component definitions for the frontend
    def get_all_component_definitions(self) -> List[Dict]:
        """Returns a list of all component definitions."""
        return [definition.model_dump() for definition in self.component_definitions.values()]

    # NEW: Core method for creating a component
    def create_component_from_elements(
        self, name: str, source_element_ids: List[str], schema: List[Dict]
    ) -> Tuple[Optional[ComponentDefinition], Optional[ComponentInstanceElement], List[str]]:
        """
        Creates a new ComponentDefinition from a list of elements, replaces them
        with a ComponentInstanceElement, and returns all affected objects.
        """
        source_elements = [self.elements.get(eid) for eid in source_element_ids if self.elements.get(eid)]
        if not source_elements:
            logger.warning("Component creation failed: no valid source elements found.")
            return None, None, []

        # 1. Calculate the bounding box of the source elements
        min_x = min(el.x for el in source_elements)
        min_y = min(el.y for el in source_elements)
        max_x = max(el.x + el.width for el in source_elements)
        max_y = max(el.y + el.height for el in source_elements)
        comp_x, comp_y = min_x, min_y
        comp_width, comp_height = max_x - min_x, max_y - min_y

        # 2. Create the template elements with positions relative to the new component's origin
        template_elements = []
        for el in source_elements:
            el_copy = el.model_copy()
            el_copy.x -= comp_x
            el_copy.y -= comp_y
            template_elements.append(el_copy.model_dump())

        # 3. Create and register the new component definition
        parsed_schema = [ComponentProperty(**s) for s in schema]
        new_definition = ComponentDefinition(name=name, template_elements=template_elements, schema=parsed_schema)
        self.component_definitions[new_definition.id] = new_definition
        logger.success(f"Created new ComponentDefinition '{name}' ({new_definition.id})")

        # 4. Create the first instance of this component
        initial_properties = {}
        for prop in new_definition.schema:
            source_element = next((el for el in source_elements if el.id == prop.target_element_id), None)
            if source_element:
                initial_properties[prop.prop_name] = getattr(source_element, prop.target_property, None)

        instance_payload = {
            "element_type": "component_instance",
            "definition_id": new_definition.id,
            "x": comp_x,
            "y": comp_y,
            "width": comp_width,
            "height": comp_height,
            "properties": initial_properties,
            "name": name,
        }
        new_instance = self.create_element_from_payload(instance_payload)

        if not new_instance: # Safety check: rollback if instance creation fails
            del self.component_definitions[new_definition.id]
            logger.error("Failed to create component instance, rolled back definition creation.")
            return None, None, []

        # 5. Delete the original source elements
        deleted_ids = self.delete_elements(source_element_ids)

        return new_definition, new_instance, deleted_ids

    def reorder_element(self, element_id: str, command: str) -> List[Element]:
        """
        Reorders an element's zIndex based on a command and returns all affected elements.
        Commands: "BRING_FORWARD", "SEND_BACKWARD", "BRING_TO_FRONT", "SEND_TO_BACK".
        """
        target_element = self.elements.get(element_id)
        if not target_element:
            logger.warning(f"Reorder command failed: element {element_id} not found.")
            return []

        sorted_elements = sorted(self.elements.values(), key=lambda el: el.zIndex)

        try:
            current_index = sorted_elements.index(target_element)
        except ValueError:
            return []

        if command == "BRING_FORWARD":
            if current_index < len(sorted_elements) - 1:
                sorted_elements.insert(
                    current_index + 1, sorted_elements.pop(current_index)
                )
        elif command == "SEND_BACKWARD":
            if current_index > 0:
                sorted_elements.insert(
                    current_index - 1, sorted_elements.pop(current_index)
                )
        elif command == "BRING_TO_FRONT":
            sorted_elements.append(sorted_elements.pop(current_index))
        elif command == "SEND_TO_BACK":
            sorted_elements.insert(0, sorted_elements.pop(current_index))
        else:
            return []

        for i, element in enumerate(sorted_elements):
            element.zIndex = i

        self._next_z_index = len(sorted_elements)
        logger.info(
            f"Reordered elements. New top element is {sorted_elements[-1].id if sorted_elements else 'None'}."
        )
        return sorted_elements

    def group_elements(self, element_ids: List[str]) -> List[Element]:
        """
        Groups a list of elements by creating a new GroupElement
        and setting their parentId.
        """
        children_to_group = [
            self.elements.get(eid) for eid in element_ids if self.elements.get(eid)
        ]
        if not children_to_group:
            logger.warning("Grouping failed: no valid elements found.")
            return []

        min_x = min(el.x for el in children_to_group)
        min_y = min(el.y for el in children_to_group)
        max_x = max(el.x + el.width for el in children_to_group)
        max_y = max(el.y + el.height for el in children_to_group)

        group_x = min_x
        group_y = min_y
        group_width = max_x - min_x
        group_height = max_y - min_y

        new_group = GroupElement(
            x=group_x, y=group_y, width=group_width, height=group_height
        )
        self.add_element(new_group)

        affected_elements = [new_group]
        for child in children_to_group:
            child.parentId = new_group.id
            child.x = child.x - group_x
            child.y = child.y - group_y
            affected_elements.append(child)
            self.elements[child.id] = child

        logger.info(
            f"Created group {new_group.id} with {len(children_to_group)} children."
        )
        return affected_elements

    def ungroup_elements(self, group_id: str) -> List[Element]:
        group = self.elements.get(group_id)
        if not group or group.element_type != "group":
            logger.warning(f"Ungroup failed: ID {group_id} is not a valid group.")
            return []

        children = [el for el in self.elements.values() if el.parentId == group_id]
        for child in children:
            child.parentId = None
            child.x += group.x
            child.y += group.y
            child.zIndex = self._next_z_index
            self._next_z_index += 1

        del self.elements[group_id]
        logger.info(f"Ungrouped {group_id}. {len(children)} children released.")
        return children

    def create_element_from_payload(self, payload: Dict) -> Optional[AnyElement]:
        """Creates a new element from a payload and adds it to the workspace."""
        element_type = payload.get("element_type")

        model_map = {
            "shape": ShapeElement,
            "text": TextElement,
            "frame": FrameElement,
            "image": ImageElement,
            "path": PathElement,
            "component_instance": ComponentInstanceElement, # <-- ADDED
        }

        element_model = model_map.get(element_type)
        if not element_model:
            logger.warning(f"Attempted to create unknown element type: {element_type}")
            return None

        try:
            new_element = element_model(**payload)
            self.add_element(new_element)
            logger.info(f"Created and added new {element_type.capitalize()}: {new_element.id}")
            return new_element
        except Exception:
            logger.exception(f"Failed to create Pydantic model for {element_type} from payload.")
            logger.error(f"Payload that caused error: {payload}")
            return None

    def _get_absolute_coords(self, element: Element) -> Tuple[float, float]:
        """Recursively calculates the absolute coordinates of an element."""
        if element.parentId and element.parentId in self.elements:
            parent = self.elements[element.parentId]
            parent_x, parent_y = self._get_absolute_coords(parent)
            return element.x + parent_x, element.y + parent_y
        return element.x, element.y

    def reparent_element(
        self, child_id: str, new_parent_id: Optional[str]
    ) -> List[Element]:
        """Moves an element to a new parent, adjusting its coordinates."""
        child = self.elements.get(child_id)
        if not child:
            logger.warning(f"Reparenting failed: child {child_id} not found.")
            return []

        abs_x, abs_y = self._get_absolute_coords(child)

        new_parent_abs_x, new_parent_abs_y = 0, 0
        if new_parent_id:
            new_parent = self.elements.get(new_parent_id)
            if not new_parent or new_parent.element_type not in ["group", "frame"]:
                logger.warning(
                    f"Reparenting failed: new parent {new_parent_id} is not a valid container."
                )
                return []
            new_parent_abs_x, new_parent_abs_y = self._get_absolute_coords(new_parent)

        child.x = abs_x - new_parent_abs_x
        child.y = abs_y - new_parent_abs_y
        child.parentId = new_parent_id
        child.zIndex = self._next_z_index
        self._next_z_index += 1

        logger.info(
            f"Reparented element {child_id} to {new_parent_id}. New relative coords: ({child.x}, {child.y})"
        )
        return [child]

    def delete_element(self, element_id: str) -> List[str]:
        """
        Deletes an element and all of its descendants recursively.
        Returns a list of all IDs that were deleted.
        """
        if element_id not in self.elements:
            return []

        ids_to_delete = [element_id]
        children_to_check = [element_id]
        while children_to_check:
            current_parent_id = children_to_check.pop(0)
            children = [
                el.id
                for el in self.elements.values()
                if el.parentId == current_parent_id
            ]
            ids_to_delete.extend(children)
            children_to_check.extend(children)

        deleted_ids = []
        for an_id in ids_to_delete:
            if an_id in self.elements:
                del self.elements[an_id]
                deleted_ids.append(an_id)

        logger.info(f"Deleted elements with IDs: {deleted_ids}")
        return deleted_ids

    def delete_elements(self, element_ids: List[str]) -> List[str]:
        # Helper method for deleting multiple elements at once.
        all_deleted_ids = []
        for eid in element_ids:
            all_deleted_ids.extend(self.delete_element(eid))
        return list(set(all_deleted_ids)) # Return unique IDs

    def reorder_layer(
        self, dragged_id: str, target_id: str, position: str
    ) -> List[Element]:
        """
        Reorders a layer relative to another layer, affecting the GLOBAL zIndex.
        `position` can be 'above' or 'below'.
        """
        dragged_element = self.elements.get(dragged_id)
        target_element = self.elements.get(target_id)

        if not dragged_element or not target_element:
            logger.warning("Layer reorder failed: one or more elements not found.")
            return []

        all_elements_sorted = sorted(self.elements.values(), key=lambda el: el.zIndex)

        try:
            all_elements_sorted.remove(dragged_element)
            target_index = all_elements_sorted.index(target_element)
            if position == "above":
                all_elements_sorted.insert(target_index + 1, dragged_element)
            else:
                all_elements_sorted.insert(target_index, dragged_element)
        except ValueError:
            logger.error(
                "Could not find element in sorted list during reorder. Aborting."
            )
            return []

        for i, element in enumerate(all_elements_sorted):
            element.zIndex = i
            self.elements[element.id] = element

        logger.success(
            f"Successfully reordered global z-index. Dragged {dragged_id} {position} {target_id}."
        )
        return list(self.elements.values())

    def update_path_point(
        self, path_id: str, point_index: int, new_x: float, new_y: float
    ) -> Optional[Element]:
        """Updates a single point of a path and correctly recalculates the element's bounds."""
        path = self.elements.get(path_id)
        if not isinstance(path, PathElement):
            return None
        if point_index >= len(path.points):
            return None

        path.points[point_index].x = new_x
        path.points[point_index].y = new_y

        all_x = [p.x for p in path.points]
        all_y = [p.y for p in path.points]
        min_x = min(all_x)
        min_y = min(all_y)

        dx = min_x
        dy = min_y

        if dx != 0 or dy != 0:
            path.x += dx
            path.y += dy
            for point in path.points:
                point.x -= dx
                point.y -= dy

        all_x_normalized = [p.x for p in path.points]
        all_y_normalized = [p.y for p in path.points]
        path.width = max(all_x_normalized) - min(all_x_normalized)
        path.height = max(all_y_normalized) - min(all_y_normalized)

        self.elements[path_id] = path
        logger.info(
            f"Updated point {point_index} for path {path_id} and recalculated bounds."
        )
        return path

    def update_presentation_order(self, payload: dict) -> List[AnyElement]:
        """
        DEFINITIVE V2: Handles multiple presentation order actions based on a payload.
        - "action": "set", "ordered_frame_ids": [...] -> Replaces the entire order.
        - "action": "add", "frame_id": "..." -> Appends a frame to the end.
        """
        action = payload.get("action")
        logger.info(f"Updating presentation order with action '{action}'")

        # Get the current, canonical list of slides from the backend state.
        current_slides = [
            el for el in self.elements.values()
            if isinstance(el, FrameElement) and el.presentationOrder is not None
        ]
        current_slides.sort(key=lambda el: el.presentationOrder)

        if action == "set":
            # This logic is for reordering, which is already working.
            ordered_frame_ids = payload.get("ordered_frame_ids", [])
            return self._set_presentation_order(ordered_frame_ids)
        
        elif action == "add":
            # THIS IS THE NEW LOGIC FOR THE DROP
            frame_id_to_add = payload.get("frame_id")
            if not frame_id_to_add: return []

            # Get the current list of slide IDs and append the new one.
            new_ordered_ids = [s.id for s in current_slides]
            if frame_id_to_add not in new_ordered_ids:
                new_ordered_ids.append(frame_id_to_add)
            
            return self._set_presentation_order(new_ordered_ids)

        return []

    def _set_presentation_order(self, ordered_frame_ids: List[str]) -> List[AnyElement]:
        """Private helper to atomically set the order from a complete list of IDs."""
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
        
        logger.success(f"Presentation order set. Broadcasting {len(elements_to_broadcast)} elements.")
        return elements_to_broadcast

    def reorder_slide(self, dragged_id: str, target_id: str, position: str) -> List[AnyElement]:
        """
        Reorders a slide relative to a target slide based on user intent.
        This is the new, robust method for managing presentation order.
        'position' can be 'above' or 'below'.
        """
        logger.info(f"Received reorder slide intent: Move {dragged_id} {position} {target_id}")

        # 1. Get all current slides from the canonical backend state.
        current_slides = [
            el for el in self.elements.values()
            if isinstance(el, FrameElement) and el.presentationOrder is not None
        ]
        if not current_slides:
            logger.warning("Reorder failed: No slides found in presentation.")
            return []
        
        # 2. Sort them to get the current, correct order.
        current_slides.sort(key=lambda el: el.presentationOrder)

        # 3. Find the dragged element in the list.
        dragged_element = next((el for el in current_slides if el.id == dragged_id), None)
        if not dragged_element:
            logger.warning(f"Reorder failed: Dragged element {dragged_id} is not a slide.")
            return []

        # 4. Perform the re-ordering operation.
        current_slides.remove(dragged_element)
        
        try:
            target_index = current_slides.index(next(el for el in current_slides if el.id == target_id))
            # Insert the dragged element relative to the target.
            # 'below' in UI terms means a higher index. 'above' means a lower index.
            if position == 'below':
                current_slides.insert(target_index + 1, dragged_element)
            else: # 'above'
                current_slides.insert(target_index, dragged_element)
        except (StopIteration, ValueError):
            logger.error(f"Reorder failed: Target element {target_id} not found.")
            return [] # Abort if the target doesn't exist

        # 5. Atomically update the `presentationOrder` for the new list.
        for i, slide in enumerate(current_slides):
            slide.presentationOrder = i
            
        logger.success("Successfully reordered slides.")
        
        # 6. Return the FULL list of updated slides to sync the client.
        return current_slides