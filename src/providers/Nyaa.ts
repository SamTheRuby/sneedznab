import { nyaaUrl } from '#/constants';
import {
  INyaaData,
  IProvider,
  ITorrentRelease,
  ISneedexRelease
} from '#interfaces/index';
import { app } from '#/index';
import { Utils } from '#utils/Utils';
import { load } from 'cheerio';

export class Nyaa implements IProvider {
  readonly name: string;
  constructor() {
    this.name = 'Nyaa';
  }

  private async fetch(query: string): Promise<INyaaData> {
    Utils.debugLog(this.name, 'cache', `${this.name}_${query}`);
    const cachedData = await app.cache.get(`${this.name}_${query}`);
    if (cachedData) {
      Utils.debugLog(this.name, 'cache', `Cache hit: ${this.name}_${query}`);
      return cachedData as INyaaData;
    }
    Utils.debugLog(this.name, 'cache', `Cache miss: ${this.name}_${query}`);

    const scrapeUrl = `https://nyaa.si/view/${query}`;
    Utils.debugLog(this.name, 'fetch', query);
    Utils.debugLog(this.name, 'fetch', `Fetching data from ${scrapeUrl}`);

    const html = await fetch(scrapeUrl).then(res => {
      if (!res.ok) throw new Error(res.statusText);
      return res.text();
    });

    const $ = load(html);

    const scrapedData = {
      title: $('body > div > div:nth-child(1) > div.panel-heading > h3')
        .text()
        .trim(),
      date: $('div.row:nth-child(1) > div:nth-child(4)').text().trim(),
      seeders: +$(
        'div.row:nth-child(2) > div:nth-child(4) > span:nth-child(1)'
      )
        .text()
        .trim(),
      leechers: +$(
        'div.row:nth-child(3) > div:nth-child(4) > span:nth-child(1)'
      )
        .text()
        .trim(),
      size: $('div.row:nth-child(4) > div:nth-child(2)').text().trim(),
      completed: +$('div.row:nth-child(4) > div:nth-child(4)').text().trim(),
      infohash: $(
        'div.row:nth-child(5) > div:nth-child(2) > kbd:nth-child(1)'
      )
        .text()
        .trim(),
      files: $(
        '.torrent-file-list > ul:nth-child(1) > li:nth-child(1) > ul:nth-child(2)'
      ).find('li').length,
      id: +query
    };

    Utils.debugLog(
      this.name,
      'fetch',
      `Fetched data, caching ${this.name}_${query}`
    );
    await app.cache.set(`${this.name}_${query}`, scrapedData);

    return scrapedData as INyaaData;
  }

  private formatTitle(originalTitle: string): string {
    const releaseGroupRegex = /^\[([^\]]+)]/;
    const releaseGroupMatch = originalTitle.match(releaseGroupRegex);
    const releaseGroup = releaseGroupMatch ? releaseGroupMatch[1] : '';

    const showNameRegex = /\]\s*([^[(\]\[]+[^)\]\[])\s*(?:(?<!Season|[Ss]\d+|Arc)\(|\[|\])/;
    const seasonRegex = /(?:Season|S|Arc)\s*(\d+|Arc)/i;
    const resolutionRegex = /\b(?<!264|265)(?:(\d{3,4}x\d{3,4})|([1-9]\d{2,3}p))\b/;
    const sourceRegex = /\b(?:BD(?:-?rip)?|BluRay|WEB(?:-?rip)?|HDTV(?:-?WEB)?|DVD(?:-?rip)?|JPBD|USBD|ITABD|R1\s?DVD|R2\s?DVD|R2J|R1J)\b/i;
    const audioRegex = /\b(FLAC|OPUS|AAC|AC3|EAC3)\b/i;
    const videoRegex = /\b(x264|x265|HEVC|AVC)\b/i;
    const hi10Regex = /\b(Hi10|Hi10P)\b/i;
    const dualAudioRegex = /\b(Dual[\s-]?Audio|EN\+JA)\b/i;

    const showName = originalTitle.match(showNameRegex)?.[1] || '';
    const season = originalTitle.match(seasonRegex)?.[0] || '';
    const resolution = originalTitle.match(resolutionRegex)?.[0] || '';
    const source = originalTitle.match(sourceRegex)?.[0]?.toUpperCase() === 'BD' ? 'BluRay' : originalTitle.match(sourceRegex)?.[0] || '';
    const audioType = originalTitle.match(audioRegex)?.[0] || '';
    let videoType = originalTitle.match(videoRegex)?.[0] || '';
    const hi10 = originalTitle.match(hi10Regex)?.[0] || '';
    const dualAudio = originalTitle.match(dualAudioRegex)?.[0] || '';

    // Handle different video types
    switch (videoType.toUpperCase()) {
      case 'HEVC':
        videoType = 'x265';
        break;
      case 'AVC':
        videoType = 'x264';
        break;
      default:
        break;
    }

    let formattedTitle = `${showName} ${season} ${resolution} ${source} ${audioType.toUpperCase()}  ${videoType.toLowerCase()}`;

    // Add Hi10 if present
    if (hi10.toUpperCase() === 'HI10' || hi10.toUpperCase() === 'HI10P') {
      if (videoType.toUpperCase() === 'X264') {
        formattedTitle += ' 10bit';
      } else {
        formattedTitle += ` x264 10bit`;
      }
    }

    // Add Dual-Audio if present
    if (dualAudio.toUpperCase() === 'DUAL-AUDIO' || dualAudio.toUpperCase() === 'EN+JA') {
      formattedTitle += ' Dual-Audio';
    }

    formattedTitle += ` SZNJD-${releaseGroup}`;

    return formattedTitle.trim();
  }

  public async get(
    anime: { title: string; alias: string },
    sneedexData: ISneedexRelease
  ): Promise<ITorrentRelease[]> {
    const bestReleaseLinks = sneedexData.best_links.length
      ? sneedexData.best_links.split(' ')
      : sneedexData.alt_links.split(' ');

    const nyaaLinks = bestReleaseLinks.filter((url: string) =>
      url.includes('nyaa.si/view/')
    );
    const nyaaIDs = nyaaLinks.length
      ? nyaaLinks.map((url: string) => +url.match(/nyaa.si\/view\/(\d+)/)[1])
      : null;

    const nyaaData = nyaaIDs
      ? await Promise.all(
          nyaaIDs.map(async (nyaaID: number) => {
            const nyaaData = await this.fetch(`${nyaaID}`);
            return nyaaData;
          })
        )
      : null;

    if (!nyaaData) return null;

    const releases: ITorrentRelease[] = nyaaData.map((data: INyaaData) => {
      const formattedTitle = this.formatTitle(data.title);

      const size = data.size.split(' ');
      const sizeInBytes =
        size[1] === 'GiB'
          ? +size[0] * 1024 * 1024 * 1024
          : +size[0] * 1024 * 1024;

      const sizeInBytesRounded = Math.round(sizeInBytes);

      const formattedDate = Utils.formatDate(
        new Date(data.date.replace(' UTC', '')).getTime()
      );

      return {
        title: formattedTitle,
        link: `https://nyaa.si/view/${data.id}`,
        url: `https://nyaa.si/download/${data.id}.torrent`,
        seeders: data.seeders,
        leechers: data.leechers,
        infohash: data.infohash,
        size: sizeInBytesRounded,
        files: data.files,
        timestamp: formattedDate,
        grabs: data.completed,
        type: 'torrent'
      };
    });

    return releases as ITorrentRelease[];
  }
}
