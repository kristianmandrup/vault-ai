import { Errors } from 'your-validation-library'; // Replace 'your-validation-library' with your actual validation library

interface Form {
  validate(): Errors;
  toString(): string;
}

export { Form };