from typing import Dict, Union, List, Optional, Tuple
from loguru import logger
from ..models.elements import (
    Element,
    ShapeElement,
    GroupElement,
    TextElement,
    FrameElement,
)


class WorkspaceService:
    def __init__(self):
        self.elements: Dict[str, Element] = {}
        self._next_z_index = 1  # Private counter for z-index
        logger.info("WorkspaceService initialized.")

    def add_element(self, element: Element) -> None:
        """Adds a new element and assigns it the highest z-index."""
        element.zIndex = self._next_z_index
        self._next_z_index += 1
        self.elements[element.id] = element
        logger.info(f"Element added: {element.id} with zIndex {element.zIndex}")

    def update_element(self, element_id: str, updates: Dict) -> Element | None:
        element = self.elements.get(element_id)
        if not element:
            logger.warning(
                f"Attempted to update non-existent element: {element_id}"
            )  # <-- New log
            return None

        updated_element = element.model_copy(update=updates)
        self.elements[element_id] = updated_element
        logger.debug(
            f"Element updated: {element_id} with data {updates}"
        )  # <-- Use DEBUG for verbose data
        return updated_element

    def get_all_elements(self) -> List[Dict]:
        return [element.model_dump() for element in self.elements.values()]

    def reorder_element(self, element_id: str, command: str) -> List[Element]:
        """
        Reorders an element's zIndex based on a command and returns all affected elements.
        Commands: "BRING_FORWARD", "SEND_BACKWARD", "BRING_TO_FRONT", "SEND_TO_BACK".
        """
        target_element = self.elements.get(element_id)
        if not target_element:
            logger.warning(f"Reorder command failed: element {element_id} not found.")
            return []

        # Create a sorted list of elements by their current zIndex
        sorted_elements = sorted(self.elements.values(), key=lambda el: el.zIndex)

        try:
            current_index = sorted_elements.index(target_element)
        except ValueError:
            return []  # Should not happen if element is in self.elements

        if command == "BRING_FORWARD":
            if current_index < len(sorted_elements) - 1:
                # Swap with the element in front
                sorted_elements.insert(
                    current_index + 1, sorted_elements.pop(current_index)
                )

        elif command == "SEND_BACKWARD":
            if current_index > 0:
                # Swap with the element behind
                sorted_elements.insert(
                    current_index - 1, sorted_elements.pop(current_index)
                )

        elif command == "BRING_TO_FRONT":
            # Move to the end of the list
            sorted_elements.append(sorted_elements.pop(current_index))

        elif command == "SEND_TO_BACK":
            # Move to the beginning of the list
            sorted_elements.insert(0, sorted_elements.pop(current_index))

        else:
            return []  # Unknown command

        # Re-assign zIndex values to the entire list based on the new order
        # This is the most robust way to handle reordering.
        for i, element in enumerate(sorted_elements):
            element.zIndex = i

        # The maximum zIndex might have changed. Update our counter.
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

        # Calculate the bounding box of the children
        min_x = min(el.x for el in children_to_group)
        min_y = min(el.y for el in children_to_group)
        max_x = max(el.x + el.width for el in children_to_group)
        max_y = max(el.y + el.height for el in children_to_group)

        # The group's position and size is the bounding box
        group_x = min_x
        group_y = min_y
        group_width = max_x - min_x
        group_height = max_y - min_y

        # Create the new group container
        new_group = GroupElement(
            x=group_x, y=group_y, width=group_width, height=group_height
        )
        self.add_element(new_group)  # add_element will assign a zIndex

        affected_elements = [new_group]

        # Update children: set their parentId and make their positions relative to the group
        for child in children_to_group:
            child.parentId = new_group.id
            child.x = child.x - group_x  # Position is now relative to parent
            child.y = child.y - group_y
            affected_elements.append(child)
            # Update the element in the main dictionary
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

        # Make children top-level again and convert their coordinates back to absolute
        for child in children:
            child.parentId = None
            child.x += group.x
            child.y += group.y
            # Re-assign z-index
            child.zIndex = self._next_z_index
            self._next_z_index += 1

        # Delete the group container
        del self.elements[group_id]

        logger.info(f"Ungrouped {group_id}. {len(children)} children released.")
        return children  # Return the now-independent children

    def create_element_from_payload(self, payload: Dict) -> Element | None:
        """Creates a new element from a frontend payload and adds it to the workspace."""
        element_type = payload.get("element_type")

        if element_type == "shape":
            try:
                new_element = ShapeElement(**payload)
                self.add_element(new_element)
                logger.info(f"Created and added new ShapeElement: {new_element.id}")
                return new_element
            except Exception as e:
                logger.error(f"Failed to create ShapeElement from payload: {e}")
                return None
        elif element_type == "text":
            try:
                new_element = TextElement(**payload)
                self.add_element(new_element)
                logger.info(f"Created and added new TextElement: {new_element.id}")
                return new_element
            except Exception as e:
                logger.error(f"Failed to create TextElement from payload: {e}")
                return None
        elif element_type == "frame":
            try:
                new_element = FrameElement(**payload)
                self.add_element(new_element)
                logger.info(f"Created and added new FrameElement: {new_element.id}")
                return new_element
            except Exception as e:
                logger.error(f"Failed to create FrameElement from payload: {e}")
                return None
        # ----------------------------

        logger.warning(f"Attempted to create unknown element type: {element_type}")
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

        # 1. Get the child's current absolute coordinates on the canvas
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

        # 2. Calculate the new relative coordinates
        child.x = abs_x - new_parent_abs_x
        child.y = abs_y - new_parent_abs_y
        child.parentId = new_parent_id

        # 3. Bring the child to the front of the stacking order within its new context
        child.zIndex = self._next_z_index
        self._next_z_index += 1

        logger.info(
            f"Reparented element {child_id} to {new_parent_id}. New relative coords: ({child.x}, {child.y})"
        )
        return [child]  # Return the updated child

    def delete_element(self, element_id: str) -> List[str]:
        """
        Deletes an element and all of its descendants recursively.
        Returns a list of all IDs that were deleted.
        """
        if element_id not in self.elements:
            return []

        ids_to_delete = [element_id]

        # Find all children recursively
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

        # Delete all identified elements from the workspace
        deleted_ids = []
        for an_id in ids_to_delete:
            if an_id in self.elements:
                del self.elements[an_id]
                deleted_ids.append(an_id)

        logger.info(f"Deleted elements with IDs: {deleted_ids}")
        return deleted_ids
