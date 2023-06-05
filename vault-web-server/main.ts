import * as flag from 'flag';
import * as fmt from 'fmt';
import * as htmltemplate from 'html/template';
import * as log from 'log';
import * as mathrand from 'math/rand';
import * as nethttp from 'net/http';
import * as os from 'os';
import * as path from 'path';
import * as strconv from 'strconv';
import * as strings from 'strings';
import * as time from 'time';

import * as gzip from 'compress/gzip';
import { io } from 'compress/gzip';
import { gzipResponseWriter } from 'compress/gzip';

import * as serverutil from 'serverutil';
import * as vectordb from 'vectordb';
import * as pinecone from 'vectordb/pinecone';
import * as qdrant from 'vectordb/qdrant';

import * as postapi from 'vault-web-server/postapi';

import * as openai from 'openai';

import * as negroni from 'negroni';
import * as mux from 'gorilla/mux';

const NegroniLogFmt = `{{.StartTime}} | {{.Status}} | {{.Duration}}
          {{.Method}} {{.Path}}`;
const NegroniDateFmt = time.Stamp;

const debugSite = flag.Bool(
  'debug', false, 'debug site');
const port = flag.String(
  'port', '8100', 'server port');
const siteConfig: Record<string, string> = {
  'DEBUG_SITE': 'false',
};

function main(): void {
  // Parse command line flags + override defaults
  flag.Parse();
  siteConfig['DEBUG_SITE'] = strconv.FormatBool(debugSite);
  mathrand.Seed(time.Now().UnixNano());

  const openaiApiKey = os.Getenv('OPENAI_API_KEY');
  if (openaiApiKey.length == 0) {
    log.Fatalln('MISSING OPENAI API KEY ENV VARIABLE');
  }
  const openaiClient = openai.NewClient(openaiApiKey);

  let vectorDB: vectordb.VectorDB;
  let err: Error | null;

  const qdrantApiEndpoint = os.Getenv('QDRANT_API_ENDPOINT');
  if (qdrantApiEndpoint.length != 0) {
    [vectorDB, err] = qdrant.New(qdrantApiEndpoint);
    if (err != null) {
      log.Fatalln('ERROR INITIALIZING QDRANT:', err);
    }
  }

  const pineconeApiEndpoint = os.Getenv('PINECONE_API_ENDPOINT');
  if (pineconeApiEndpoint.length != 0) {
    const pineconeApiKey = os.Getenv('PINECONE_API_KEY');
    if (pineconeApiKey.length == 0) {
      log.Fatalln('MISSING PINECONE API KEY ENV VARIABLE');
    }

    [vectorDB, err] = pinecone.New(pineconeApiEndpoint, pineconeApiKey);
    if (err != null) {
      log.Fatalln('ERROR INITIALIZING PINECONE:', err);
    }
  }

  if (vectorDB == null) {
    log.Fatalln('NO VECTOR DB CONFIGURED (QDRANT_API_ENDPOINT or PINECONE_API_ENDPOINT)');
  }

  const handlerContext = postapi.NewHandlerContext(openaiClient, vectorDB);

  // Configure main web server
  const server = negroni.New();
  server.Use(negroni.NewRecovery());
  const l = negroni.NewLogger();
  l.SetFormat(NegroniLogFmt);
  l.SetDateFormat(NegroniDateFmt);
  server.Use(l);
  const mx = mux.NewRouter();

  // Path Routing Rules: [POST]
  mx.HandleFunc('/api/questions', handlerContext.QuestionHandler).Methods('POST');
  mx.HandleFunc('/upload', handlerContext.UploadHandler).Methods('POST');

  // Path Routing Rules: Static Handlers
  mx.HandleFunc('/github', StaticRedirectHandler('https://github.com/pashpashpash/vault'));
  mx.PathPrefix('/').Handler(ReactFileServer(nethttp.Dir(serverutil.WebAbs(''))));

  // Start up web server
  server.UseHandler(mx);

  // if serving on https, need to provide self-signed certs
  if (port == '443') {
    go(httpRedirect); // redirect all http to https
    const certFile = '/etc/letsencrypt/live/vault.pash.city/fullchain.pem';
    const keyFile = '/etc/letsencrypt/live/vault.pash.city/privkey.pem';
    log.Println('[negroni] listening on :443');
    log.Fatal(nethttp.ListenAndServeTLS(':'+port, certFile, keyFile, server));
  } else {
    server.Run(':' + port);
  }
}

// / Takes a response writer Meta config and URL and servers the react app with the correct metadata
function ServeIndex(w: nethttp.ResponseWriter, r: nethttp.Request, meta: serverutil.SiteConfig): void {
  //Here we handle the possible dev environments or pass the basic Hostpath with "/" at the end for the / metadata for each site
  let currentHost: string;
  let currentSite: string;

  // create local version of the Global SiteConfig variable to prevent editing concurrent variables.
  const localSiteConfig: Record<string, string> = {};
  for (const [key, element] of Object.entries(siteConfig)) {
    localSiteConfig[key] = element;
  }

  //set the host Manually when on local host
  if (r.Host == 'localhost:8100') {
    currentHost = 'vault.pash.city';
    currentSite = 'vault';
  } else {
    currentHost = r.Host;
    currentSite = 'vault';
  }

  const currentpath = currentHost + r.URL.Path;
  //check if the currentpath has Metadata associated with it
  //if no metadata is founnd use the default / route
  const ctx = r.Context();
  defer ctx.Done();

  // TODO fix metadata api
  const currentMetaData = meta.SitePath[currentpath];

  localSiteConfig['PageTitle'] = currentMetaData.PageTitle;
  localSiteConfig['PageIcon'] = currentMetaData.PageIcon;
  localSiteConfig['MetaType'] = currentMetaData.MetaType;
  localSiteConfig['MetaTitle'] = currentMetaData.MetaTitle;
  localSiteConfig['MetaDescription'] = currentMetaData.MetaDescription;
  localSiteConfig['MetaUrl'] = 'https://' + currentHost + r.URL.String();
  localSiteConfig['MetaKeywords'] = currentMetaData.MetaKeywords;
  localSiteConfig['Site'] = currentSite;
  localSiteConfig['TwitterUsername'] = currentMetaData.TwitterUsername;
  /// Here we need to check the type and either add an Image meta tag or a video metatag depending on the result
  if (currentMetaData.MetaImage != '!') {
    localSiteConfig['contentType'] = 'og:image';
    localSiteConfig['content'] = currentMetaData.MetaImage;
  } else {
    localSiteConfig['contentType'] = 'og:video';
    if (currentMetaData.MetaVideo != '!') {
      localSiteConfig['content'] = currentMetaData.MetaVideo;
    } else {
      localSiteConfig['content'] = '';
      log.Fatalln('Image and video tag missing from JSON template');
    }
  }

  const replaceEmpty = (i: string, r: string): string => {
    if (i == '') {
      return r;
    }
    return i;
  };

  localSiteConfig['MetaTitle'] = replaceEmpty(localSiteConfig['MetaTitle'], 'OP Question-Answer Stack');
  localSiteConfig['MetaType'] = replaceEmpty(localSiteConfig['MetaType'], 'website');
  localSiteConfig['MetaDescription'] = replaceEmpty(
    localSiteConfig['MetaDescription'],
    'Upload any number of files (pdf, text, epub) and use them as context when asking OpenAI questions.'
  );
  localSiteConfig['TwitterUsername'] = replaceEmpty(localSiteConfig['TwitterUsername'], '@pashmerepat');
  localSiteConfig['MetaKeywords'] = replaceEmpty(localSiteConfig['MetaKeywords'], 'OpenAI, Pinecone, ChatGPT');
  localSiteConfig['PageTitle'] = replaceEmpty(localSiteConfig['PageTitle'], 'The Vault | OP Question-Answer Stack');
  localSiteConfig['PageIcon'] = replaceEmpty(localSiteConfig['Icon'], '/img/logos/vault-favicon.png');
  localSiteConfig['content'] = replaceEmpty(localSiteConfig['content'], 'https://i.imgur.com/6YSvyEV.png');
  localSiteConfig['contentType'] = replaceEmpty(localSiteConfig['contentType'], 'og:image');
  localSiteConfig['ImageHeight'] = replaceEmpty(localSiteConfig['ImageHeight'], '1024');
  localSiteConfig['ImageWidth'] = replaceEmpty(localSiteConfig['ImageWidth'], '1024');

  const t = template.ParseFiles(serverutil.WebAbs('index.html'));
  const config = {
    Config: localSiteConfig,
  };
  if (err != null) {
    log.Fatalln('Critical error parsing index template!', err);
  }

  if (err2 != null) {
    log.Fatalln('Template execute error!', err);
  }
}

class gzipResponseWriter {
  Writer: io.Writer;
  ResponseWriter: nethttp.ResponseWriter;

  constructor(Writer: io.Writer, ResponseWriter: nethttp.ResponseWriter) {
    this.Writer = Writer;
    this.ResponseWriter = ResponseWriter;
  }

  Write(b: []byte): number, error {
    return this.Writer.Write(b);
  }
}

// Forwards all traffic to React, except basic file serving
function ReactFileServer(fs: nethttp.FileSystem): nethttp.Handler {
  const fsh = nethttp.FileServer(fs);

  return nethttp.HandlerFunc(function (w: nethttp.ResponseWriter, r: nethttp.Request): void {
    //get the Metadata Config
    const jsonConfig = serverutil.GetConfig();

    if (path.Clean(r.URL.Path) == '/' || path.Clean(r.URL.Path) == '/index.html') {
      ServeIndex(w, r, jsonConfig.SiteMetaData);
      return;
    }

    if (os.Stat(serverutil.WebAbs(r.URL.Path)), os.IsNotExist(err)) {
      ServeIndex(w, r, jsonConfig.SiteMetaData);
      return;
    }

    // if gzip not possible serve as is
    if (!strings.Contains(r.Header.Get('Accept-Encoding'), 'gzip')) {
      fsh.ServeHTTP(w, r);
      return;
    }

    w.Header().Set('Content-Encoding', 'gzip');
    w.Header().Set('Vary', 'Accept-Encoding');
    gzipWriter := gzip.NewWriter(w);
    defer gzipWriter.Close();

    const writer: gzipResponseWriter = gzipResponseWriter{
      Writer: gzipWriter,
      ResponseWriter: w,
    };

    // Try to serve the gzipped file
    const f, err = fs.Open(r.URL.Path + '.gz');
    if err == nil {
      const fi, _ = f.Stat();
      if fi.IsDir() {
        // if it's a directory, just serve the directory listing
        fsh.ServeHTTP(w, r);
        return;
      }

      http.ServeContent(writer, r, r.URL.Path, fi.ModTime(), f);
      return;
    }

    // fallback to serving the uncompressed file
    fsh.ServeHTTP(writer, r);
  });
}

// This function redirects all http traffic to the https equivalent
function httpRedirect(): void {
  log.Println('[redirector] listening on :80');
  log.Fatal(nethttp.ListenAndServe(':80', nethttp.HandlerFunc(function (w: nethttp.ResponseWriter, r: nethttp.Request): void {
    target := 'https://' + r.Host + r.URL.Path;
    if len(r.URL.RawQuery) > 0 {
      target += '?' + r.URL.RawQuery;
    }
    log.Printf('Redirecting %s to %s', r.URL.String(), target);
    nethttp.Redirect(w, r, target, nethttp.StatusTemporaryRedirect);
  })));
}

// StaticRedirectHandler redirects the request to the provided URL
function StaticRedirectHandler(url: string): nethttp.HandlerFunc {
  return nethttp.HandlerFunc(function (w: nethttp.ResponseWriter, r: nethttp.Request): void {
    nethttp.Redirect(w, r, url, nethttp.StatusTemporaryRedirect);
  });
}

main();
