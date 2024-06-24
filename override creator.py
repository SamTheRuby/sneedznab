import re
import json
import os

def extract_info(raw_title):
    release_group = re.search(r'\[([^]]+)\]|\(([^)]+)\)|-(\w+)$', raw_title)
    release_group = release_group.group(1) or release_group.group(2) or release_group.group(3) if release_group else None

    show_name = re.search(r'\[([^]]+)\]\s*(.+?)(?=\s+(S\d{1,2}|R\d{1,2}|Arc|Season|E\d+-\d+|\+))', raw_title)
    show_name = show_name.group(2) if show_name else None

    season = re.search(r'(S\d{1,2})|(R\d{1,2})|(season \d{1,2})|(Arc .+?)', raw_title, re.IGNORECASE)
    season = season.group() if season else None
    if season:
        if season.lower().startswith('season'):
            season = re.sub(r'Season (\d{1,2})', lambda m: f'S{int(m.group(1)):02}', season, flags=re.IGNORECASE)
        elif season.lower().startswith('s') or season.lower().startswith('r'):
            season = re.sub(r'([SR])(\d{1,2})', lambda m: f'{m.group(1).upper()}{int(m.group(2)):02}', season)

    resolution = re.search(r'1080p|1920x1080|720p|1280x720|576p|480p|640x480|2160p|3480x2160', raw_title)
    resolution = resolution.group() if resolution else None

    source = re.search(r'BD(-rip)?|BluRay|WEB(-rip)?|DVD(-rip)?', raw_title, re.IGNORECASE)
    if source and 'BD' in source.group(0):
        source = 'BluRay'
    else:
        source = source.group() if source else None

    audio = re.search(r'FLAC|OPUS|AAC|AC3|EAC3', raw_title, re.IGNORECASE)
    audio = audio.group() if audio else None

    video = re.search(r'x264|x265|HEVC|AVC', raw_title, re.IGNORECASE)
    video = video.group() if video else None

    hi10 = None
    dual_audio = None

    version = re.search(r'v\d', raw_title)
    version = version.group() if version else None

    return {
        "release_group": release_group,
        "show_name": show_name,
        "season": season,
        "resolution": resolution,
        "source": source,
        "audio": audio,
        "video": video,
        "hi10": hi10,
        "dual_audio": dual_audio,
        "version": version
    }

def prompt_for_changes(info):
    for key, value in info.items():
        if key in ['hi10', 'dual_audio']:
            continue
        new_value = input(f"{key.replace('_', ' ').title()}: ({value if value else 'Not Found'}) ").strip()
        if new_value:
            info[key] = new_value

    episode_range = input("Episode Range (e.g., 1-25): ").strip()
    if episode_range:
        info["episode_range"] = f"E{episode_range}"

    hi10_input = input("Hi10 (y/n): ").lower().strip()
    info['hi10'] = "Hi10p" if hi10_input == 'y' else None

    dual_audio_input = input("Dual Audio (y/n): ").lower().strip()
    info['dual_audio'] = "Dual Audio" if dual_audio_input == 'y' else None

def update_json(nyaa_key, formatted_title):
    json_file = "overrides3.json"
    data = {}
    if os.path.exists(json_file):
        with open(json_file, "r") as file:
            try:
                data = json.load(file)
            except json.decoder.JSONDecodeError:
                pass

    data[nyaa_key] = formatted_title

    with open(json_file, "w") as file:
        json.dump(data, file, indent=2)

def main():
    while True:
        raw_title = input("Enter raw title: ")
        info = extract_info(raw_title)
        prompt_for_changes(info)

        formatted_title_parts = [
            info['show_name'],
            info['season'],
            info.get('episode_range', ''),
            info['resolution'],
            info['source'],
            info['audio'],
            info['video'],
            info['hi10'],
            info['dual_audio'],
            info['version']
        ]
        formatted_title = ' '.join(part for part in formatted_title_parts if part and part != 'None')
        formatted_title += f" SZNJD-{info['release_group'].replace(' ', '-')}" if info['release_group'] else ""
        print("Formatted Title:", formatted_title)

        nyaa_key = input("Enter nyaa key: ").strip()
        update_json(nyaa_key, formatted_title)

        continue_flag = input("Do you want to continue? (y/n): ").lower().strip()
        if continue_flag != 'y':
            break

if __name__ == "__main__":
    main()
