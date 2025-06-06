import { ButtonGroupItem } from "./Item";
import { ButtonGroupRoot } from "./Root";

export const ButtonGroup = Object.assign(ButtonGroupRoot, {
  Item: ButtonGroupItem,
});
