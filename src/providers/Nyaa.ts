import * as fs from 'fs';
import fetch from 'node-fetch';
import { load } from 'cheerio';
import { Utils } from '#utils/Utils';
import { app } from '#/index';
import { INyaaData, IProvider, ITorrentRelease, ISneedexRelease } from '#interfaces/index';

export class Nyaa implements IProvider {
  readonly name: string;
  private overrideList: Record<string, string> = {};

  constructor() {
    this.name = 'Nyaa';
    this.loadOverrides();
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

    const response = await fetch(scrapeUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${scrapeUrl}: ${response.statusText}`);
    }
    const html = await response.text();

    const $ = load(html);

    const scrapedData: INyaaData = {
      title: $('div.panel-heading > h3').text().trim(),
      date: $('div.row:nth-child(1) > div:nth-child(4)').text().trim(),
      seeders: +$('div.row:nth-child(2) > div:nth-child(4) > span:nth-child(1)').text().trim(),
      leechers: +$('div.row:nth-child(3) > div:nth-child(4) > span:nth-child(1)').text().trim(),
      size: $('div.row:nth-child(4) > div:nth-child(2)').text().trim(),
      completed: +$('div.row:nth-child(4) > div:nth-child(4)').text().trim(),
      infohash: $('div.row:nth-child(5) > div:nth-child(2) > kbd:nth-child(1)').text().trim(),
      files: $('.torrent-file-list > ul:nth-child(1) > li').length,
      id: +query
    };

    Utils.debugLog(this.name, 'fetch', `Fetched data, caching ${this.name}_${query}`);
    await app.cache.set(`${this.name}_${query}`, scrapedData);

    return scrapedData;
  }

  private loadOverrides(): void {
    try {
      const data = fs.readFileSync('/app/src/providers/overrides.json', 'utf8');
      this.overrideList = JSON.parse(data);
    } catch (error) {
      console.error('Error loading overrides:', error);
    }
  }

  private formatTitle(originalTitle: string): string {
    const patterns = {
      releaseGroup: /\[([^\]]+)]/,
      showName: /\]\s*([^[(\]\[]+[^)\]\[])\s*(?:(?<!Season|[Ss]\d+|Arc)\(|\[|\])/,
      season: /(?:Season|S|Arc)\s*(\d+|Arc)/i,
      resolution: /\b(?<!264|265)(?:(\d{3,4}x\d{3,4})|([1-9]\d{2,3}p))\b/,
      source: /\b(?:BD(?:-?rip)?|BluRay|WEB(?:-?rip)?|HDTV(?:-?WEB)?|DVD(?:-?rip)?|JPBD|USBD|ITABD|R1\s?DVD|R2\s?DVD|R2J|R1J)\b/i,
      audio: /\b(FLAC|OPUS|AAC|AC3|EAC3)\b/i,
      video: /\b(x264|x265|HEVC|AVC)\b/i,
      hi10: /\b(Hi10|Hi10P)\b/i,
      dualAudio: /\b(Dual[\s-]?Audio|EN\+JA)\b/i
    };

    const releaseGroupMatch = originalTitle.match(patterns.releaseGroup);
    const releaseGroup = releaseGroupMatch ? releaseGroupMatch[1] : '';
    const showNameMatch = originalTitle.match(patterns.showName);
    const showName = showNameMatch ? showNameMatch[1] : '';
    const seasonMatch = originalTitle.match(patterns.season);
    const season = seasonMatch ? seasonMatch[0] : '';
    const resolutionMatch = originalTitle.match(patterns.resolution);
    const resolution = resolutionMatch ? resolutionMatch[0] : '';
    const sourceMatch = originalTitle.match(patterns.source);
    const source = sourceMatch && sourceMatch[0].toUpperCase() === 'BD' ? 'BluRay' : (sourceMatch ? sourceMatch[0] : '');
    const audioTypeMatch = originalTitle.match(patterns.audio);
    const audioType = audioTypeMatch ? audioTypeMatch[0].toUpperCase() : '';
    let videoType = (originalTitle.match(patterns.video) || [''])[0];
    const hi10Match = originalTitle.match(patterns.hi10);
    const hi10 = hi10Match ? hi10Match[0] : '';
    const dualAudioMatch = originalTitle.match(patterns.dualAudio);
    const dualAudio = dualAudioMatch ? dualAudioMatch[0] : '';

    if (videoType.toUpperCase() === 'HEVC') {
      videoType = 'x265';
    } else if (videoType.toUpperCase() === 'AVC') {
      videoType = 'x264';
    }

    let formattedTitle = `${showName} ${season} ${resolution} ${source} ${audioType} ${videoType.toLowerCase()}`;

    if (hi10.toUpperCase() === 'HI10' || hi10.toUpperCase() === 'HI10P') {
      formattedTitle += ` x264 10bit`;
    }

    if (dualAudio.toUpperCase() === 'DUAL-AUDIO' || dualAudio.toUpperCase() === 'EN+JA') {
      formattedTitle += ' Dual-Audio';
    }

    formattedTitle += ` SZNJD-${releaseGroup}`;

    return formattedTitle.trim();
  }

  public async get(anime: { title: string; alias: string }, sneedexData: ISneedexRelease): Promise<ITorrentRelease[]> {
    const bestReleaseLinks = sneedexData.best_links.length ? sneedexData.best_links.split(' ') : sneedexData.alt_links.split(' ');
    const nyaaIDs = bestReleaseLinks.map(url => +url.match(/nyaa.si\/view\/(\d+)/)?.[1]).filter(Boolean);

    const nyaaData = await Promise.all(nyaaIDs.map(nyaaID => this.fetch(`${nyaaID}`)));

    const releases: ITorrentRelease[] = nyaaData.map(data => {
      const formattedTitle = this.overrideList[data.id] || this.formatTitle(data.title);

      const size = data.size.split(' ');
      const sizeInBytes = size[1] === 'GiB' ? +size[0] * 1024 * 1024 * 1024 : +size[0] * 1024 * 1024;
      const sizeInBytesRounded = Math.round(sizeInBytes);

      const formattedDate = Utils.formatDate(new Date(data.date.replace(' UTC', '')).getTime());

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

    return releases;
  }
}
