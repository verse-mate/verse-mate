import { InputDate } from "./Date";
import { InputHead as Label } from "./Head";
import { InputHelperMessage as Message } from "./HelperMessage";
import { Input as Component } from "./Input";
import { InputPassword as Password } from "./Password";
import { InputRoot as Root } from "./Root";
import { InputSimpleFormatPhone as Phone } from "./SimpleFormatPhone";
import { InputSlot as Slot } from "./Slot";
import { InputTime as Time } from "./Time";

export const Input = Object.assign(Component, {
  Label,
  Message,
  Root,
  Password,
  Slot,
  Date: InputDate,
  Phone,
  Time,
});
