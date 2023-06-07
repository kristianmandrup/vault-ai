import * as mail from 'net/mail';
import { ErrorMap, Error } from "../errors";

const SPECIAL_DELETE_ASCII = '\x10';

export class Email {
  emailAddr: string;

  constructor(emailAddr: string) {
    this.emailAddr = emailAddr;
  }

  validate(errs: ErrorMap): void {    
    if (this.emailAddr === SPECIAL_DELETE_ASCII) {
      return;
    }

    const emailRegex = new RegExp("^.+@.+\\..+$");

    // Just does basic parser validation, note that foo@localhost is valid
    if (!mail.validate(this.emailAddr)) {
      errs["email"] = new Error("email did not parse");
    }

    // Does SUPER basic regex validation that email must have @ and .
    if (!emailRegex.test(this.emailAddr)) {
      errs["email"] = new Error("email format invalid");
    }

    if (this.emailAddr.length > 320) {
      errs["email"] = new Error("email format invalid: too long");
    }
  }
}

function validateEmail(errs: errorlist.Errors, email: Email): void {
  const emailRegex = new RegExp("^.+@.+\\..+$");

  // Just does basic parser validation, note that foo@localhost is valid
  if (!mail.validate(email.emailAddr)) {
    errs["email"] = new errorlist.NewError("email did not parse");
  }

  // Does SUPER basic regex validation that email must have @ and .
  if (!emailRegex.test(email.emailAddr)) {
    errs["email"] = new errorlist.NewError("email format invalid");
  }

  if (email.emailAddr.length > 320) {
    errs["email"] = new errorlist.NewError("email format invalid: too long");
  }
}
