import { Errors, checkNotEmpty } from 'your-validation-library'; // Replace 'your-validation-library' with your actual validation library

class QuestionForm {
  Question: string;
  Model: string;
  UUID: string;
  ApiKey: string;

  constructor(question: string, model: string, uuid: string, apiKey: string) {
    this.Question = question;
    this.Model = model;
    this.UUID = uuid;
    this.ApiKey = apiKey;
  }

  validate(): Errors {
    const errs = new Errors();

    checkNotEmpty(this.Question, 'question', errs);
    checkNotEmpty(this.Model, 'model', errs);

    return errs;
  }

  toString(): string {
    return this.Question;
  }
}

export { QuestionForm };
