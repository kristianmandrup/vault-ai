import { ErrorMap, Error } from "../errors";

export interface Validator {
  validate(errors: ErrorMap): void;
}

export function checkNotEmpty(input: string, name: string, errs: ErrorMap): void {
  if (input.trim().length === 0) {
    errs[name] = new Error("cannot be blank");
  }
}