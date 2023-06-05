import * as fs from 'fs';
import * as path from 'path';

interface WebPageTemplate {
  PageTitle: string;
  PageIcon: string;
  MetaTitle: string;
  MetaDescription: string;
  MetaVideo: string;
  MetaType: string;
  MetaImage: string;
  MetaUrl: string;
  TwitterUsername: string;
  MetaKeywords: string;
}

interface SiteConfig {
  SitePath: Record<string, WebPageTemplate>;
}

interface ConstantsConfig {
  SiteMetaData: SiteConfig;
}

const CONFIG_READ_MUTEX = new Mutex();
let CONFIG: ConstantsConfig | null = null;

const WEB_METADATA_PATH = './config/websites.json';

function GetConfig(): ConstantsConfig {
  CONFIG_READ_MUTEX.lock();
  try {
    if (CONFIG !== null) {
      return CONFIG;
    }

    CONFIG = {
      SiteMetaData: {
        SitePath: {},
      },
    };

    const metaData: SiteConfig = JSON.parse(fs.readFileSync(path.resolve(WEB_METADATA_PATH), 'utf8'));
    CONFIG.SiteMetaData = metaData;

    console.log('[Config] Loaded ./config/ files');

    return CONFIG;
  } finally {
    CONFIG_READ_MUTEX.unlock();
  }
}

function unmarshalFile<T>(filePath: string): T {
  try {
    const resolvedPath = path.resolve(filePath);
    const file = fs.readFileSync(resolvedPath, 'utf8');
    return JSON.parse(file);
  } catch (err) {
    console.error(`Failed to parse ${filePath}: ${err}`);
    process.exit(1);
  }
}
