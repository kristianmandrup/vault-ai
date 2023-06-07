import * as http from 'http';
import * as log from 'log'; // Replace with the appropriate log library
import * as json from 'json'; // Replace with the appropriate JSON library
import * as errorlist from 'path/to/errorlist'; // Replace with the correct path to the errorlist module
import * as form from 'path/to/form'; // Replace with the correct path to the form module
import { Decoder, Schema } from 'path/to/schema'; // Replace with the correct path to the schema module

function formParseVerify(form: form.Form, name: string, w: http.ServerResponse, r: http.IncomingMessage): errorlist.Errors {
  if (r.headers['content-type']?.startsWith('multipart/form-data')) {
    const chunks: Buffer[] = [];
    let totalSize = 0;

    r.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
      totalSize += chunk.length;
    });

    r.on('end', () => {
      const formData = Buffer.concat(chunks, totalSize).toString();

      // Parse the form data
      const decodedFormData = querystring.parse(formData);
      const decoder = new Decoder();
      const decodedForm = decoder.decode(decodedFormData, form);

      // Verify and validate the form data
      const schema = new Schema(form);
      const validationErrors = schema.validate(decodedForm);

      if (validationErrors.length > 0) {
        log.printf('[%s] Validation FAIL: %s %s\n', name, form, validationErrors);

        const errors = errorlist.new(validationErrors);
        const bytes = json.stringify(errors);

        if (bytes) {
          log.println('Dev fucked up bad, errors didn't JSON encode');
        }

        http.error(w, bytes, http.StatusBadRequest);
        return errors;
      }

      log.printf('[%s] Validated: %s\n', name, form);
      return null;
    });

    r.on('error', (err: Error) => {
      log.printf('[%s] Error parsing form POST\n', name);
      const errs = errorlist.newSingleError('parsePost', err);

      const bytes = json.stringify(errs);
      if (bytes) {
        log.println('Dev fucked up bad, errors didn't JSON encode');
        return null;
      }

      http.error(w, bytes, http.StatusBadRequest);
      return errs;
    });
  } else {
    log.printf('[%s] Invalid content type: %s\n', name, r.headers['content-type']);
    const errMsg = 'Invalid content type';
    const errs = errorlist.newSingleError('parsePost', new Error(errMsg));

    const bytes = json.stringify(errs);
    if (bytes) {
      log.println('Dev fucked up bad, errors didn't JSON encode');
      return null;
    }

    http.error(w, bytes, http.StatusBadRequest);
    return errs;
  }
}
