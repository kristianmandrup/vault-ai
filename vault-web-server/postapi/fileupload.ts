import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as querystring from 'querystring';
import * as chunk from 'path/to/chunk'; // Replace with the correct path to the chunk module
import * as openai from 'path/to/openai'; // Replace with the correct path to the openai module

interface UploadResponse {
  message: string;
  numFilesSucceeded: number;
  numFilesFailed: number;
  successfulFileNames: string[];
  failedFileNames: { [key: string]: string };
}

const MAX_FILE_SIZE: number = 3 << 20; // 3 MB
const MAX_TOTAL_UPLOAD_SIZE: number = 3 << 20; // 3 MB

class HandlerContext {
  openAIClient: openai.Client;
  vectorDB: any; // Replace with the appropriate type for your vector DB

  constructor(openAIClient: openai.Client, vectorDB: any) {
    this.openAIClient = openAIClient;
    this.vectorDB = vectorDB;
  }

  uploadHandler(req: http.IncomingMessage, res: http.ServerResponse): void {
    const w = res;
    const r = req;

    // Limit the request body size
    r.on('data', (data) => {});
    r.on('end', () => {});
    r.on('error', (err) => {});

    r.pipe(
      http.maxHeaderSize(w, MAX_TOTAL_UPLOAD_SIZE, () => {
        const err = null;

        if (err) {
          if (
            err === http.ErrorMissingBoundary ||
            err === http.ErrorNotMultipart ||
            err === http.ErrorNotSupported
          ) {
            console.log('[UploadHandler ERR] Error parsing multipart form:', err);
            http.error(w, err, http.StatusBadRequest);
            return;
          }

          console.log('[UploadHandler ERR] Request body size exceeds the limit:', err);
          http.error(w, 'Request body size exceeds the limit', http.StatusRequestEntityTooLarge);
          return;
        }

        const files = r.form.file['files'];
        const uuid = r.form['uuid']; // Get the UUID from the form data
        const userProvidedOpenApiKey = r.form['apikey'];

        console.log('[UploadHandler] UUID=', uuid);

        let clientToUse = this.openAIClient;
        if (userProvidedOpenApiKey) {
          console.log('[UploadHandler] Using provided custom API key:', userProvidedOpenApiKey);
          clientToUse = new openai.Client(userProvidedOpenApiKey);
        }

        const responseData: UploadResponse = {
          successfulFileNames: [],
          failedFileNames: {},
          numFilesSucceeded: 0,
          numFilesFailed: 0,
        };

        for (const file of files) {
          const fileName = file.name;

          if (file.size > MAX_FILE_SIZE) {
            const errMsg = `File size exceeds the ${MAX_FILE_SIZE} bytes limit`;
            console.log('[UploadHandler ERR]', errMsg, fileName);
            responseData.numFilesFailed++;
            responseData.failedFileNames[fileName] = errMsg;
            continue;
          }

          // Read the file in memory
          const f = fs.createReadStream(file.path);
          f.on('error', (err) => {
            const errMsg = 'Error opening file';
            console.log('[UploadHandler ERR]', errMsg, err);
            responseData.numFilesFailed++;
            responseData.failedFileNames[fileName] = errMsg;
          });

          // Get the file name, MIME type, and first 32 characters of the contents
          const fileType = file.headers['Content-Type'];
          let fileContent = '';
          let filePreview = '';

          // Check if the file is a PDF
          if (fileType === 'application/pdf') {
            try {
              fileContent = chunk.extractTextFromPDFSync(f, file.size);
            } catch (err) {
              const errMsg = 'Error extracting text from PDF';
              console.log('[UploadHandler ERR]', errMsg, err);
              responseData.numFilesFailed++;
              responseData.failedFileNames[fileName] = errMsg;
              continue;
            }
          } else {
            try {
              fileContent = fs.readFileSync(file.path, 'utf-8');
            } catch (err) {
              const errMsg = 'Error reading file';
              console.log('[UploadHandler ERR]', errMsg, err);
              responseData.numFilesFailed++;
              responseData.failedFileNames[fileName] = errMsg;
              continue;
            }
          }

          if (fileContent.length > 32) {
            filePreview = fileContent.slice(0, 32);
          }
          console.log(`File Name: ${fileName}, File Type: ${fileType}, File Content (first 32 characters): ${filePreview}`);

          // Process the fileBytes into embeddings and store in vector DB here
          const chunks = chunk.createChunksSync(fileContent, fileName);
          if (!chunks) {
            const errMsg = 'Error chunking file';
            console.log('[UploadHandler ERR]', errMsg);
            responseData.numFilesFailed++;
            responseData.failedFileNames[fileName] = errMsg;
            continue;
          }

          let embeddings;
          try {
            embeddings = getEmbeddings(clientToUse, chunks, 100, openai.AdaEmbeddingV2);
          } catch (err) {
            const errMsg = `Error getting embeddings: ${err}`;
            console.log('[UploadHandler ERR]', errMsg);
            responseData.numFilesFailed++;
            responseData.failedFileNames[fileName] = errMsg;
            continue;
          }
          console.log(`Total chunks: ${chunks.length}`);
          console.log(`Total embeddings: ${embeddings.length}`);
          console.log(`Embeddings length: ${embeddings[0].length}`);

          try {
            ctx.vectorDB.upsertEmbeddings(embeddings, chunks, uuid);
          } catch (err) {
            const errMsg = `Error upserting embeddings to vector DB: ${err}`;
            console.log('[UploadHandler ERR]', errMsg);
            responseData.numFilesFailed++;
            responseData.failedFileNames[fileName] = errMsg;
            continue;
          }

          console.log('Successfully added vector DB embeddings!');

          responseData.numFilesSucceeded++;
          responseData.successfulFileNames.push(fileName);
        }

        if (responseData.numFilesFailed > 0) {
          responseData.message = 'Some files failed to upload and process';
        } else {
          responseData.message = 'All files uploaded and processed successfully';
        }

        w.writeHead(http.StatusOK, { 'Content-Type': 'application/json' });
        const jsonResponse = JSON.stringify(responseData);
        w.write(jsonResponse);
      })
    );
  }
}
