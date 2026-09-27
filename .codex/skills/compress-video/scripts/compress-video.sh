#!/usr/bin/env bash
set -euo pipefail

MAX_MB=5
HEIGHT=720
KEEP=""
CRF_START=23

usage() {
  cat >&2 <<'EOF'
Usage:
  compress-video.sh <video-path>
  compress-video.sh --keep START-END[,START-END...] <video-path>
  compress-video.sh --height 720 --max-mb 5 <video-path>

--keep ranges are seconds (decimal OK). Open end: 13.5-
Example: --keep 0.5-8.0,13.5-
EOF
  exit 1
}

human_size() {
  local bytes="$1"
  if (( bytes >= 1048576 )); then
    awk -v b="$bytes" 'BEGIN { printf "%.2f MB", b / 1048576 }'
  else
    awk -v b="$bytes" 'BEGIN { printf "%.0f KB", b / 1024 }'
  fi
}

get_size() {
  stat -f%z "$1" 2>/dev/null || stat -c%s "$1"
}

ensure_ffmpeg() {
  if command -v ffmpeg >/dev/null 2>&1 && command -v ffprobe >/dev/null 2>&1; then
    return 0
  fi
  if [[ -x /opt/homebrew/bin/ffmpeg ]]; then
    PATH="/opt/homebrew/bin:${PATH}"
    export PATH
    return 0
  fi
  echo "ffmpeg/ffprobe not found. Install: brew install ffmpeg" >&2
  exit 1
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --keep)
        [[ $# -ge 2 ]] || usage
        KEEP="$2"
        shift 2
        ;;
      --height)
        [[ $# -ge 2 ]] || usage
        HEIGHT="$2"
        shift 2
        ;;
      --max-mb)
        [[ $# -ge 2 ]] || usage
        MAX_MB="$2"
        shift 2
        ;;
      -h|--help)
        usage
        ;;
      -*)
        echo "Unknown option: $1" >&2
        usage
        ;;
      *)
        if [[ -n "${SRC:-}" ]]; then
          echo "Unexpected argument: $1" >&2
          usage
        fi
        SRC="$1"
        shift
        ;;
    esac
  done
  [[ -n "${SRC:-}" ]] || usage
}

probe_duration() {
  ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$1"
}

has_audio() {
  ffprobe -v error -select_streams a:0 -show_entries stream=codec_type -of csv=p=0 "$1" | grep -q .
}

# Build ffmpeg filter for optional keep-ranges + scale.
# Sets FILTER_COMPLEX, MAP_V, MAP_A (empty if no audio), HAS_AUDIO, OUT_DURATION_HINT
build_filter() {
  local src_duration="$1"
  local scale="scale=-2:${HEIGHT}"

  if [[ -z "$KEEP" ]]; then
    if [[ "$HAS_AUDIO" == "1" ]]; then
      FILTER_COMPLEX="[0:v]${scale}[v];[0:a]aformat=channel_layouts=mono[a]"
      MAP_V="[v]"
      MAP_A="[a]"
    else
      FILTER_COMPLEX="[0:v]${scale}[v]"
      MAP_V="[v]"
      MAP_A=""
    fi
    OUT_DURATION_HINT="$src_duration"
    return
  fi

  local IFS=','
  local -a ranges=()
  read -r -a ranges <<< "$KEEP"

  local i=0
  local filter=""
  local concat_in=""
  local total=0

  for range in "${ranges[@]}"; do
    local start="${range%%-*}"
    local end="${range#*-}"
    [[ -n "$start" ]] || { echo "Bad --keep range: $range" >&2; exit 1; }
    if [[ -z "$end" ]]; then
      end="$src_duration"
    fi
    local seg
    seg="$(awk -v s="$start" -v e="$end" 'BEGIN { d=e-s; if (d<=0) exit 1; print d }')" || {
      echo "Bad --keep range (end <= start): $range" >&2
      exit 1
    }
    total="$(awk -v a="$total" -v b="$seg" 'BEGIN { print a+b }')"

    filter+="[0:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS,${scale}[v${i}];"
    if [[ "$HAS_AUDIO" == "1" ]]; then
      filter+="[0:a]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS,aformat=channel_layouts=mono[a${i}];"
      concat_in+="[v${i}][a${i}]"
    else
      concat_in+="[v${i}]"
    fi
    i=$((i + 1))
  done

  if [[ "$HAS_AUDIO" == "1" ]]; then
    filter+="${concat_in}concat=n=${i}:v=1:a=1[v][a]"
    MAP_A="[a]"
  else
    filter+="${concat_in}concat=n=${i}:v=1:a=0[v]"
    MAP_A=""
  fi
  FILTER_COMPLEX="$filter"
  MAP_V="[v]"
  OUT_DURATION_HINT="$total"
}

encode_once() {
  local src="$1"
  local out="$2"
  local crf="$3"
  local audio_k="$4"
  local maxrate_k="$5"

  local -a args=(
    -y -i "$src"
    -filter_complex "$FILTER_COMPLEX"
    -map "$MAP_V"
  )
  if [[ -n "$MAP_A" ]]; then
    args+=(-map "$MAP_A" -c:a aac -b:a "${audio_k}k" -ac 1)
  else
    args+=(-an)
  fi
  args+=(-c:v libx264 -preset slow -crf "$crf" -pix_fmt yuv420p -movflags +faststart)

  if [[ -n "$maxrate_k" ]]; then
    args+=(-maxrate "${maxrate_k}k" -bufsize "$((maxrate_k * 2))k")
  fi

  ffmpeg "${args[@]}" "$out" 2>/dev/null
}

main() {
  parse_args "$@"
  ensure_ffmpeg

  if [[ ! -f "$SRC" ]]; then
    echo "File not found: $SRC" >&2
    exit 1
  fi

  local ext="${SRC##*.}"
  local ext_lc
  ext_lc="$(printf '%s' "$ext" | tr '[:upper:]' '[:lower:]')"
  case "$ext_lc" in
    mov|mp4|m4v|webm|mkv|avi) ;;
    *)
      echo "Unsupported video type: .$ext" >&2
      exit 1
      ;;
  esac

  local dir base stem out
  dir="$(cd "$(dirname "$SRC")" && pwd)"
  base="$(basename "$SRC")"
  stem="${base%.*}"
  out="${dir}/${stem}.mp4"

  local before after max_bytes
  before="$(get_size "$SRC")"
  max_bytes="$(awk -v m="$MAX_MB" 'BEGIN { printf "%.0f", m * 1024 * 1024 }')"

  local duration
  duration="$(probe_duration "$SRC")"
  if has_audio "$SRC"; then
    HAS_AUDIO=1
  else
    HAS_AUDIO=0
  fi
  build_filter "$duration"

  local tmp
  tmp="$(mktemp -t compress-video.XXXXXX).mp4"

  # Bitrate budget for target size (leave headroom).
  local budget_kbits video_maxrate
  budget_kbits="$(awk -v bytes="$max_bytes" -v d="$OUT_DURATION_HINT" \
    'BEGIN { if (d<=0) d=1; printf "%.0f", (bytes*8/1000)*0.90/d }')"
  video_maxrate="$(awk -v b="$budget_kbits" 'BEGIN { v=b-96; if (v<200) v=200; print v }')"

  local crf="$CRF_START"
  local audio_k=96
  local attempt=1
  local ok=0

  echo "source: $SRC ($(human_size "$before"), ${duration}s)"
  if [[ -n "$KEEP" ]]; then
    echo "keep:   $KEEP (~${OUT_DURATION_HINT}s)"
  fi
  echo "target: ${HEIGHT}p, < ${MAX_MB} MB"

  while (( attempt <= 6 )); do
    echo "attempt ${attempt}: crf=${crf}, a=${audio_k}k, maxrate=${video_maxrate}k"
    if ! encode_once "$SRC" "$tmp" "$crf" "$audio_k" "$video_maxrate"; then
      echo "ffmpeg failed on attempt ${attempt}" >&2
      rm -f "$tmp"
      exit 1
    fi
    after="$(get_size "$tmp")"
    if (( after < max_bytes )); then
      ok=1
      break
    fi
    # Stronger ladder
    crf=$((crf + 3))
    if (( crf > 32 )); then crf=32; fi
    audio_k=64
    video_maxrate="$(awk -v v="$video_maxrate" 'BEGIN { n=int(v*0.75); if (n<150) n=150; print n }')"
    attempt=$((attempt + 1))
  done

  if (( ok != 1 )); then
    after="$(get_size "$tmp")"
    echo "Warning: still >= ${MAX_MB} MB after retries ($(human_size "$after")). Not replacing." >&2
    echo "$tmp" >&2
    exit 2
  fi

  # Replace: write .mp4, remove original if different path
  mv -f "$tmp" "$out"
  if [[ "$(cd "$(dirname "$SRC")" && pwd)/$(basename "$SRC")" != "$out" ]]; then
    rm -f "$SRC"
  fi

  after="$(get_size "$out")"
  echo "$out"
  echo "  before: $(human_size "$before")"
  echo "  after:  $(human_size "$after") ($(( after * 100 / before ))%)"
  echo "  under ${MAX_MB} MB: yes"
}

main "$@"
