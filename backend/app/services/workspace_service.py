from typing import Dict, Union, List, Optional
from loguru import logger
from ..models.elements import Element, ShapeElement, GroupElement


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
