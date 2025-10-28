import React from "react";
import { ClickUpList } from "../../clickup/types";

interface ClickUpDropdownProps {
  lists: ClickUpList[];
  selectedListId: string | null;
  onSelectList: (listId: string | null) => void;
  isEnabled: boolean;
}

export const ClickUpDropdown: React.FC<ClickUpDropdownProps> = ({
  lists,
  selectedListId,
  onSelectList,
  isEnabled,
}) => {
  if (!isEnabled || lists.length === 0) {
    return null;
  }

  return (
    <select
      className="clickup-dropdown"
      value={selectedListId || ""}
      onChange={(e) => onSelectList(e.target.value || null)}
    >
      <option value="">Select ClickUp List...</option>
      {lists.map((list) => (
        <option key={list.id} value={list.id}>
          {list.name}
        </option>
      ))}
    </select>
  );
};
