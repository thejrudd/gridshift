#!/usr/bin/env python3
"""Offline, fail-closed calibration for GridShift live win probability.

The raw nflverse play-by-play files and Sleeper league data are development
inputs only. This script caches normalized inputs under ignored ``tmp/``,
reconstructs historical fantasy matchups, fits a small global model on
2023-2024, evaluates it once on 2025, and writes only aggregate outputs.

Dependencies:
    python3 -m pip install rdata pandas numpy
"""

from __future__ import annotations

import argparse
import collections
import dataclasses
import datetime as dt
import hashlib
import json
import math
import os
import re
import sys
import time
import urllib.error
import urllib.request
import warnings
from pathlib import Path
from typing import Any, DefaultDict, Dict, Iterable, List, Mapping, MutableMapping, Optional, Sequence, Tuple

try:
    import numpy as np
    import pandas as pd
    import rdata
except ImportError as error:
    print(
        "Missing calibration dependencies. Install with: "
        "python3 -m pip install rdata pandas numpy",
        file=sys.stderr,
    )
    raise SystemExit(2) from error


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MANIFEST = ROOT / "scripts" / "win-probability-leagues.local.json"
DEFAULT_CACHE_DIR = ROOT / "tmp" / "win-probability-calibration"
DEFAULT_CANDIDATE = DEFAULT_CACHE_DIR / "candidate.json"
DEFAULT_REPORT = ROOT / "docs" / "Win Probability Backtest Report.md"
SLEEPER_BASE = "https://api.sleeper.app/v1"
USER_AGENT = "GridShift-WinProbabilityCalibration/1.0"
REGULAR_SEASON_WEEKS = tuple(range(1, 19))
TRAINING_SEASONS = (2023, 2024)
EVALUATION_SEASON = 2025
SNAPSHOT_MINUTES = 15

POSITION_DEFAULT_PROJECTION = {
    "QB": 17.0,
    "RB": 12.0,
    "WR": 12.0,
    "TE": 8.0,
    "K": 8.0,
    "DEF": 7.0,
    "IDP": 8.0,
    "FLEX": 10.0,
}
RECENT_WEIGHT = {
    "QB": 0.50,
    "RB": 0.60,
    "WR": 0.50,
    "TE": 0.50,
    "K": 0.35,
    "DEF": 0.60,
    "IDP": 0.35,
    "FLEX": 0.50,
}
IDP_POSITIONS = {
    "DL", "DE", "DT", "LB", "ILB", "OLB", "DB", "CB", "S", "SS", "FS", "IDP",
}
TEAM_ALIASES = {
    "GNB": "GB",
    "JAC": "JAX",
    "KAN": "KC",
    "LVR": "LV",
    "LA": "LAR",
    "NEP": "NE",
    "NOR": "NO",
    "SFO": "SF",
    "TAM": "TB",
    "WSH": "WAS",
}

SCORING_ALIASES = {
    "idp_qb_hit": "idp_qbhit",
    "idp_pass_def": "idp_pd",
    "idp_fum_rec": "idp_fr",
    "idp_fum_ret_yd": "idp_fr_yd",
    "idp_safe": "idp_safety",
    "fum_rec_td": "fum_ret_td",
    "int_ret_td": "pass_int_td",
    "rush_att": "bonus_rush_att",
    "pass_td_40p": "bonus_pass_td_40p",
    "pass_td_50p": "bonus_pass_td_50p",
    "pass_cmp_40p": "bonus_pass_cmp_40p",
    "rush_td_40p": "bonus_rush_td_40p",
    "rush_td_50p": "bonus_rush_td_50p",
    "rec_td_40p": "bonus_rec_td_40p",
    "rec_td_50p": "bonus_rec_td_50p",
    "rec_40p": "bonus_rec_40p",
    "rush_40p": "bonus_rush_40p",
    "ff": "idp_ff",
    "def_st_td": "st_td",
    "def_st_ff": "def_ff",
    "def_st_fum_rec": "fum_rec",
}

DIRECT_SCORING_KEYS = {
    "pass_yd", "pass_td", "pass_int", "pass_int_td", "pass_2pt", "pass_sack",
    "pass_cmp", "pass_att", "pass_inc", "pass_fd",
    "rush_yd", "rush_td", "rush_2pt", "rush_fd",
    "rec", "rec_yd", "rec_td", "rec_2pt", "rec_fd",
    "rec_0_4", "rec_5_9", "rec_10_19", "rec_20_29", "rec_30_39",
    "fum", "fum_lost", "fum_rec", "fum_ret_td", "st_td", "ret_td", "kr_td",
    "pr_td", "blk_kick", "blk_kick_ret_td", "kr_yd", "pr_yd",
    "st_tkl_solo", "blk_kick_ret_yd", "fg_ret_yd", "fum_ret_yd",
    "bonus_pass_yd_300", "bonus_pass_yd_400", "bonus_rush_yd_100",
    "bonus_rush_yd_200", "bonus_rec_yd_100", "bonus_rec_yd_200",
    "bonus_rush_rec_yd_100", "bonus_rush_rec_yd_200", "bonus_pass_cmp_25",
    "bonus_rush_att_20", "bonus_pass_td_40p", "bonus_pass_td_50p",
    "bonus_pass_cmp_40p", "bonus_rush_td_40p", "bonus_rush_td_50p",
    "bonus_rec_td_40p", "bonus_rec_td_50p", "bonus_rec_40p", "bonus_rush_40p",
    "bonus_def_fum_td_50p", "bonus_def_int_td_50p",
    "idp_tkl", "idp_tkl_solo", "idp_tkl_ast", "idp_tkl_loss", "idp_sack",
    "idp_sack_yd", "idp_int", "idp_int_ret_yd", "idp_int_td", "idp_ff",
    "idp_fr", "idp_fr_yd", "idp_fr_td", "idp_def_td", "idp_pd",
    "idp_qbhit", "idp_safety", "idp_blk_kick", "bonus_sack_2p",
    "bonus_tkl_10p", "idp_pass_def_3p",
    "fgm", "fgm_0_19", "fgm_20_29", "fgm_30_39", "fgm_0_39",
    "fgm_40_49", "fgm_50_59", "fgm_50p", "fgm_60p", "fgmiss",
    "fgmiss_0_19", "fgmiss_20_29", "fgmiss_30_39", "fgmiss_0_39",
    "fgmiss_40_49", "fgmiss_50_59", "fgmiss_50p", "fgmiss_60p",
    "xpm", "xpmiss", "fgm_yds", "fgm_yds_over_30",
    "def_td", "def_2pt", "def_int_td", "def_fum_td", "def_ff",
    "def_3_and_out", "def_4_and_stop", "def_forced_punts", "def_pass_def",
    "def_st_tkl_solo", "def_kr_yd", "def_pr_yd", "sack", "sack_yd", "int",
    "int_ret_yd", "safe", "tkl", "tkl_solo", "tkl_ast", "tkl_loss",
    "qb_hit", "pts_allow", "pts_allow_0", "pts_allow_1_6", "pts_allow_7_13",
    "pts_allow_14_17", "pts_allow_18_21", "pts_allow_22_27",
    "pts_allow_14_20", "pts_allow_21_27", "pts_allow_28_34",
    "pts_allow_35_45", "pts_allow_46p", "pts_allow_35p", "yds_allow",
    "yds_allow_0_100", "yds_allow_100_199", "yds_allow_200_299",
    "yds_allow_300_349", "yds_allow_350_399", "yds_allow_400_449",
    "yds_allow_450_499", "yds_allow_500_549", "yds_allow_550p",
}
POSITION_SCORING_KEYS = {
    "bonus_rec_te", "bonus_rec_rb", "bonus_rec_wr", "bonus_rush_att",
    "bonus_fd_qb", "bonus_fd_rb", "bonus_fd_wr", "bonus_fd_te",
}
SUPPORTED_SCORING_KEYS = DIRECT_SCORING_KEYS | POSITION_SCORING_KEYS

PBP_COLUMNS = {
    "game_id", "season", "season_type", "week", "home_team", "away_team",
    "play_id", "order_sequence", "time_of_day", "start_time", "qtr",
    "game_seconds_remaining", "desc", "posteam", "defteam", "td_team",
    "return_team", "play_type", "yards_gained", "posteam_score",
    "posteam_score_post", "pass_attempt", "complete_pass", "incomplete_pass",
    "pass_touchdown", "rush_attempt", "rush_touchdown", "interception", "sack",
    "first_down_pass", "first_down_rush", "passing_yards", "receiving_yards",
    "rushing_yards", "passer_player_id", "receiver_player_id",
    "rusher_player_id", "two_point_attempt", "two_point_conv_result", "fumble",
    "fumble_lost", "fumbled_1_player_id", "fumbled_1_team",
    "fumbled_2_player_id", "fumbled_2_team", "fumble_recovery_1_player_id",
    "fumble_recovery_1_team", "fumble_recovery_1_yards",
    "fumble_recovery_2_player_id", "fumble_recovery_2_team",
    "fumble_recovery_2_yards", "punt_returner_player_id",
    "kickoff_returner_player_id", "return_yards", "return_touchdown",
    "field_goal_attempt", "field_goal_result", "kick_distance",
    "extra_point_attempt", "extra_point_result", "kicker_player_id",
    "solo_tackle_1_player_id", "solo_tackle_1_team", "solo_tackle_2_player_id",
    "solo_tackle_2_team", "assist_tackle_1_player_id", "assist_tackle_1_team",
    "assist_tackle_2_player_id", "assist_tackle_2_team",
    "assist_tackle_3_player_id", "assist_tackle_3_team",
    "assist_tackle_4_player_id", "assist_tackle_4_team",
    "tackle_for_loss_1_player_id", "tackle_for_loss_2_player_id",
    "qb_hit_1_player_id", "qb_hit_2_player_id", "forced_fumble_player_1_player_id",
    "forced_fumble_player_1_team", "forced_fumble_player_2_player_id",
    "forced_fumble_player_2_team", "interception_player_id",
    "lateral_interception_player_id", "pass_defense_1_player_id",
    "pass_defense_2_player_id", "sack_player_id", "half_sack_1_player_id",
    "half_sack_2_player_id", "safety_player_id", "blocked_player_id",
    "punt_blocked", "punt_attempt", "fourth_down_failed", "third_down_failed",
    "touchdown", "special_teams_play",
    "passer_player_name", "receiver_player_name", "rusher_player_name",
    "punt_returner_player_name", "kickoff_returner_player_name",
    "kicker_player_name", "fumbled_1_player_name", "fumbled_2_player_name",
    "fumble_recovery_1_player_name", "fumble_recovery_2_player_name",
    "interception_player_name", "pass_defense_1_player_name",
    "pass_defense_2_player_name", "sack_player_name",
    "half_sack_1_player_name", "half_sack_2_player_name",
    "solo_tackle_1_player_name", "solo_tackle_2_player_name",
    "assist_tackle_1_player_name", "assist_tackle_2_player_name",
    "assist_tackle_3_player_name", "assist_tackle_4_player_name",
    "tackle_for_loss_1_player_name", "tackle_for_loss_2_player_name",
    "qb_hit_1_player_name", "qb_hit_2_player_name",
    "forced_fumble_player_1_player_name", "forced_fumble_player_2_player_name",
    "safety_player_name", "blocked_player_name",
}

ENTITY_NAME_FIELDS = (
    ("passer_player_id", "passer_player_name", "posteam"),
    ("receiver_player_id", "receiver_player_name", "posteam"),
    ("rusher_player_id", "rusher_player_name", "posteam"),
    ("punt_returner_player_id", "punt_returner_player_name", "return_team"),
    ("kickoff_returner_player_id", "kickoff_returner_player_name", "return_team"),
    ("kicker_player_id", "kicker_player_name", "posteam"),
    ("fumbled_1_player_id", "fumbled_1_player_name", "fumbled_1_team"),
    ("fumbled_2_player_id", "fumbled_2_player_name", "fumbled_2_team"),
    ("fumble_recovery_1_player_id", "fumble_recovery_1_player_name", "fumble_recovery_1_team"),
    ("fumble_recovery_2_player_id", "fumble_recovery_2_player_name", "fumble_recovery_2_team"),
    ("interception_player_id", "interception_player_name", "defteam"),
    ("pass_defense_1_player_id", "pass_defense_1_player_name", "defteam"),
    ("pass_defense_2_player_id", "pass_defense_2_player_name", "defteam"),
    ("sack_player_id", "sack_player_name", "defteam"),
    ("half_sack_1_player_id", "half_sack_1_player_name", "defteam"),
    ("half_sack_2_player_id", "half_sack_2_player_name", "defteam"),
    ("solo_tackle_1_player_id", "solo_tackle_1_player_name", "solo_tackle_1_team"),
    ("solo_tackle_2_player_id", "solo_tackle_2_player_name", "solo_tackle_2_team"),
    ("assist_tackle_1_player_id", "assist_tackle_1_player_name", "assist_tackle_1_team"),
    ("assist_tackle_2_player_id", "assist_tackle_2_player_name", "assist_tackle_2_team"),
    ("assist_tackle_3_player_id", "assist_tackle_3_player_name", "assist_tackle_3_team"),
    ("assist_tackle_4_player_id", "assist_tackle_4_player_name", "assist_tackle_4_team"),
    ("tackle_for_loss_1_player_id", "tackle_for_loss_1_player_name", "defteam"),
    ("tackle_for_loss_2_player_id", "tackle_for_loss_2_player_name", "defteam"),
    ("qb_hit_1_player_id", "qb_hit_1_player_name", "defteam"),
    ("qb_hit_2_player_id", "qb_hit_2_player_name", "defteam"),
    ("forced_fumble_player_1_player_id", "forced_fumble_player_1_player_name", "forced_fumble_player_1_team"),
    ("forced_fumble_player_2_player_id", "forced_fumble_player_2_player_name", "forced_fumble_player_2_team"),
    ("safety_player_id", "safety_player_name", "defteam"),
    ("blocked_player_id", "blocked_player_name", "defteam"),
)


@dataclasses.dataclass
class PreparedEvent:
    at_ns: int
    game_id: str
    game_remaining: float
    updates: List[Tuple[str, str, float]]
    teams: List[Tuple[str, str]]


@dataclasses.dataclass
class PreparedWeek:
    events: List[PreparedEvent]
    games: Dict[str, Dict[str, Any]]
    team_game: Dict[str, str]
    entity_team: Dict[str, str]


@dataclasses.dataclass
class ReconstructionAudit:
    timestamp_total: int = 0
    timestamp_present: int = 0
    mapped: DefaultDict[str, int] = dataclasses.field(
        default_factory=lambda: collections.defaultdict(int)
    )
    mapping_total: DefaultDict[str, int] = dataclasses.field(
        default_factory=lambda: collections.defaultdict(int)
    )
    paired_matchups: DefaultDict[int, int] = dataclasses.field(
        default_factory=lambda: collections.defaultdict(int)
    )
    reconciled_matchups: DefaultDict[int, int] = dataclasses.field(
        default_factory=lambda: collections.defaultdict(int)
    )
    late_matchups: int = 0
    reconciled_late_matchups: int = 0
    side_errors: List[float] = dataclasses.field(default_factory=list)
    unsupported_scoring_keys: set = dataclasses.field(default_factory=set)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--cache-dir", type=Path, default=DEFAULT_CACHE_DIR)
    parser.add_argument("--candidate", type=Path, default=DEFAULT_CANDIDATE)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--offline", action="store_true")
    return parser.parse_args()


def number(value: Any, default: float = 0.0) -> float:
    try:
        result = float(value)
    except (TypeError, ValueError):
        return default
    return result if math.isfinite(result) else default


def flag(value: Any) -> bool:
    return number(value) > 0


def clean_id(value: Any) -> Optional[str]:
    if value is None:
        return None
    raw = str(value).strip()
    if not raw or raw.lower() in {"nan", "none", "<na>"}:
        return None
    return raw


def team_abbr(value: Any) -> Optional[str]:
    raw = clean_id(value)
    if not raw:
        return None
    upper = raw.upper()
    return TEAM_ALIASES.get(upper, upper)


def position_group(position: Any) -> str:
    pos = str(position or "").upper()
    if pos in IDP_POSITIONS:
        return "IDP"
    if pos in {"DST", "D/ST"}:
        return "DEF"
    if pos in POSITION_DEFAULT_PROJECTION:
        return pos
    return "FLEX"


def stable_key(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:16]


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n")
    temporary.replace(path)


def read_json(path: Path) -> Any:
    return json.loads(path.read_text())


def fetch_json(url: str, cache_path: Path, refresh: bool, offline: bool) -> Any:
    if cache_path.exists() and not refresh:
        return read_json(cache_path)
    if offline:
        raise RuntimeError(f"Offline cache miss: {cache_path.name}")
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    last_error: Optional[Exception] = None
    for attempt in range(4):
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                payload = json.loads(response.read().decode("utf-8"))
            write_json(cache_path, payload)
            return payload
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
            last_error = error
            if attempt < 3:
                time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"Sleeper request failed after retries: {url}") from last_error


def validate_manifest(path: Path) -> Dict[str, Any]:
    if not path.is_file():
        raise RuntimeError(
            f"Missing local manifest: {path}. Copy the example file and keep it untracked."
        )
    manifest = read_json(path)
    play_by_play = manifest.get("playByPlay")
    leagues = manifest.get("leagues")
    if not isinstance(play_by_play, dict) or not isinstance(leagues, list):
        raise RuntimeError("Manifest must contain playByPlay and leagues.")
    normalized_pbp: Dict[int, Path] = {}
    for season in (*TRAINING_SEASONS, EVALUATION_SEASON):
        raw = play_by_play.get(str(season))
        if not raw:
            raise RuntimeError(f"Manifest has no playByPlay path for {season}.")
        pbp_path = Path(raw).expanduser()
        if not pbp_path.is_file():
            raise RuntimeError(f"Play-by-play file does not exist for {season}.")
        normalized_pbp[season] = pbp_path
    normalized_leagues = []
    seen = set()
    for row in leagues:
        season = int(row.get("season", 0))
        league_id = str(row.get("leagueId", "")).strip()
        if season not in {*TRAINING_SEASONS, EVALUATION_SEASON} or not league_id:
            raise RuntimeError("Each league row needs a supported season and leagueId.")
        identity = (season, league_id)
        if identity in seen:
            raise RuntimeError("Manifest contains a duplicate league-season row.")
        seen.add(identity)
        normalized_leagues.append(
            {
                "season": season,
                "leagueId": league_id,
                "cacheKey": f"{season}-{stable_key(league_id)}",
            }
        )
    if not normalized_leagues:
        raise RuntimeError("Manifest contains no calibration leagues.")
    return {"playByPlay": normalized_pbp, "leagues": normalized_leagues}


def load_sleeper_inputs(
    manifest: Mapping[str, Any],
    cache_dir: Path,
    refresh: bool,
    offline: bool,
) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    sleeper_dir = cache_dir / "sleeper"
    players = fetch_json(
        f"{SLEEPER_BASE}/players/nfl",
        sleeper_dir / "players-nfl.json",
        refresh,
        offline,
    )
    contexts = []
    for config in manifest["leagues"]:
        league_id = config["leagueId"]
        cache_key = config["cacheKey"]
        league = fetch_json(
            f"{SLEEPER_BASE}/league/{league_id}",
            sleeper_dir / f"league-{cache_key}.json",
            refresh,
            offline,
        )
        if int(league.get("season", 0)) != config["season"]:
            raise RuntimeError("Sleeper league season does not match the local manifest.")
        matchups = {}
        for week in REGULAR_SEASON_WEEKS:
            matchups[week] = fetch_json(
                f"{SLEEPER_BASE}/league/{league_id}/matchups/{week}",
                sleeper_dir / f"matchups-{cache_key}-w{week:02d}.json",
                refresh,
                offline,
            )
        contexts.append(
            {
                "season": config["season"],
                "cacheKey": cache_key,
                "league": league,
                "matchups": matchups,
                "scoring": normalize_scoring(league.get("scoring_settings") or {}),
            }
        )
    return players, contexts


def normalize_scoring(raw: Mapping[str, Any]) -> Dict[str, float]:
    scoring: Dict[str, float] = {}
    for key, value in raw.items():
        numeric = number(value)
        normalized = SCORING_ALIASES.get(key, key)
        scoring[normalized] = numeric
    return scoring


def load_pbp(season: int, source: Path, cache_dir: Path, refresh: bool) -> pd.DataFrame:
    normalized_dir = cache_dir / "normalized"
    normalized_dir.mkdir(parents=True, exist_ok=True)
    fingerprint = hashlib.sha256(
        f"{source.resolve()}:{source.stat().st_size}:{source.stat().st_mtime_ns}".encode("utf-8")
    ).hexdigest()[:16]
    cache_path = normalized_dir / f"pbp-{season}-{fingerprint}.pkl"
    if cache_path.exists() and not refresh:
        return pd.read_pickle(cache_path)
    warnings.filterwarnings("ignore", message="Missing constructor for R class")
    frame = rdata.read_rds(str(source))
    if not isinstance(frame, pd.DataFrame):
        raise RuntimeError(f"RDS {season} did not contain a data frame.")
    available = sorted(PBP_COLUMNS.intersection(frame.columns))
    missing_required = {
        "game_id", "season_type", "week", "home_team", "away_team",
        "time_of_day", "game_seconds_remaining",
    }.difference(available)
    if missing_required:
        raise RuntimeError(
            f"RDS {season} is missing required columns: {sorted(missing_required)}"
        )
    frame = frame.loc[
        (frame["season_type"].astype(str).str.upper() == "REG")
        & pd.to_numeric(frame["week"], errors="coerce").isin(REGULAR_SEASON_WEEKS),
        available,
    ].copy()
    frame["week"] = pd.to_numeric(frame["week"], errors="coerce").astype("Int64")
    # nflverse mixes whole-second and fractional-second ISO timestamps in this
    # column. Pandas' default vector parser can silently discard the latter.
    frame["_event_at"] = pd.to_datetime(
        frame["time_of_day"],
        errors="coerce",
        utc=True,
        format="mixed",
    )
    frame["_order"] = pd.to_numeric(
        frame.get("order_sequence", frame.get("play_id")), errors="coerce"
    ).fillna(0)
    frame.to_pickle(cache_path)
    return frame


def add_update(
    updates: List[Tuple[str, str, float]],
    teams: List[Tuple[str, str]],
    entity: Any,
    stat: str,
    value: Any,
    team: Any = None,
) -> None:
    entity_id = clean_id(entity)
    numeric = number(value)
    if not entity_id or not numeric:
        return
    updates.append((entity_id, stat, numeric))
    normalized_team = team_abbr(team)
    if normalized_team:
        teams.append((entity_id, normalized_team))


def remember_team(teams: List[Tuple[str, str]], entity: Any, team: Any) -> None:
    entity_id = clean_id(entity)
    normalized_team = team_abbr(team)
    if entity_id and normalized_team:
        teams.append((entity_id, normalized_team))


def field_goal_bucket(distance: float, made: bool) -> str:
    prefix = "fgm" if made else "fgmiss"
    if distance < 20:
        return f"{prefix}_0_19"
    if distance < 30:
        return f"{prefix}_20_29"
    if distance < 40:
        return f"{prefix}_30_39"
    if distance < 50:
        return f"{prefix}_40_49"
    if distance < 60:
        return f"{prefix}_50_59"
    return f"{prefix}_60p"


def row_updates(row: Mapping[str, Any]) -> Tuple[List[Tuple[str, str, float]], List[Tuple[str, str]]]:
    updates: List[Tuple[str, str, float]] = []
    teams: List[Tuple[str, str]] = []
    offense = team_abbr(row.get("posteam"))
    defense = team_abbr(row.get("defteam"))
    passer = clean_id(row.get("passer_player_id"))
    receiver = clean_id(row.get("receiver_player_id"))
    rusher = clean_id(row.get("rusher_player_id"))

    remember_team(teams, passer, offense)
    remember_team(teams, receiver, offense)
    remember_team(teams, rusher, offense)

    if passer and flag(row.get("pass_attempt")):
        add_update(updates, teams, passer, "pass_att", 1, offense)
        if flag(row.get("complete_pass")):
            add_update(updates, teams, passer, "pass_cmp", 1, offense)
        elif flag(row.get("incomplete_pass")) or not flag(row.get("sack")):
            add_update(updates, teams, passer, "pass_inc", 1, offense)
        passing_yards = number(row.get("passing_yards"))
        add_update(updates, teams, passer, "pass_yd", passing_yards, offense)
        if flag(row.get("pass_touchdown")):
            add_update(updates, teams, passer, "pass_td", 1, offense)
            if passing_yards >= 40:
                add_update(updates, teams, passer, "bonus_pass_td_40p", 1, offense)
            if passing_yards >= 50:
                add_update(updates, teams, passer, "bonus_pass_td_50p", 1, offense)
        if passing_yards >= 40 and flag(row.get("complete_pass")):
            add_update(updates, teams, passer, "bonus_pass_cmp_40p", 1, offense)
        if flag(row.get("first_down_pass")):
            add_update(updates, teams, passer, "pass_fd", 1, offense)
        if flag(row.get("interception")):
            add_update(updates, teams, passer, "pass_int", 1, offense)
            if flag(row.get("touchdown")) and team_abbr(row.get("td_team")) == defense:
                add_update(updates, teams, passer, "pass_int_td", 1, offense)

    if passer and flag(row.get("sack")):
        add_update(updates, teams, passer, "pass_sack", 1, offense)

    if rusher and flag(row.get("rush_attempt")):
        rushing_yards = number(row.get("rushing_yards"))
        add_update(updates, teams, rusher, "rush_att", 1, offense)
        add_update(updates, teams, rusher, "rush_yd", rushing_yards, offense)
        if flag(row.get("rush_touchdown")):
            add_update(updates, teams, rusher, "rush_td", 1, offense)
            if rushing_yards >= 40:
                add_update(updates, teams, rusher, "bonus_rush_td_40p", 1, offense)
            if rushing_yards >= 50:
                add_update(updates, teams, rusher, "bonus_rush_td_50p", 1, offense)
        if rushing_yards >= 40:
            add_update(updates, teams, rusher, "bonus_rush_40p", 1, offense)
        if flag(row.get("first_down_rush")):
            add_update(updates, teams, rusher, "rush_fd", 1, offense)

    if receiver and flag(row.get("complete_pass")):
        receiving_yards = number(row.get("receiving_yards"))
        add_update(updates, teams, receiver, "rec", 1, offense)
        add_update(updates, teams, receiver, "rec_yd", receiving_yards, offense)
        if receiving_yards <= 4:
            reception_bucket = "rec_0_4"
        elif receiving_yards <= 9:
            reception_bucket = "rec_5_9"
        elif receiving_yards <= 19:
            reception_bucket = "rec_10_19"
        elif receiving_yards <= 29:
            reception_bucket = "rec_20_29"
        else:
            reception_bucket = "rec_30_39"
        add_update(updates, teams, receiver, reception_bucket, 1, offense)
        if flag(row.get("pass_touchdown")):
            add_update(updates, teams, receiver, "rec_td", 1, offense)
            if receiving_yards >= 40:
                add_update(updates, teams, receiver, "bonus_rec_td_40p", 1, offense)
            if receiving_yards >= 50:
                add_update(updates, teams, receiver, "bonus_rec_td_50p", 1, offense)
        if receiving_yards >= 40:
            add_update(updates, teams, receiver, "bonus_rec_40p", 1, offense)
        if flag(row.get("first_down_pass")):
            add_update(updates, teams, receiver, "rec_fd", 1, offense)

    if flag(row.get("two_point_attempt")) and str(row.get("two_point_conv_result", "")).lower() == "success":
        if passer:
            add_update(updates, teams, passer, "pass_2pt", 1, offense)
        if receiver:
            add_update(updates, teams, receiver, "rec_2pt", 1, offense)
        elif rusher:
            add_update(updates, teams, rusher, "rush_2pt", 1, offense)

    fumbled_ids = [
        (row.get("fumbled_1_player_id"), row.get("fumbled_1_team")),
        (row.get("fumbled_2_player_id"), row.get("fumbled_2_team")),
    ]
    for fumbled_id, fumbled_team in fumbled_ids:
        if clean_id(fumbled_id):
            add_update(updates, teams, fumbled_id, "fum", 1, fumbled_team or offense)
            if flag(row.get("fumble_lost")):
                add_update(updates, teams, fumbled_id, "fum_lost", 1, fumbled_team or offense)

    recoveries = [
        (
            row.get("fumble_recovery_1_player_id"),
            row.get("fumble_recovery_1_team"),
            row.get("fumble_recovery_1_yards"),
        ),
        (
            row.get("fumble_recovery_2_player_id"),
            row.get("fumble_recovery_2_team"),
            row.get("fumble_recovery_2_yards"),
        ),
    ]
    for recovery_id, recovery_team, recovery_yards in recoveries:
        if clean_id(recovery_id):
            add_update(updates, teams, recovery_id, "fum_rec", 1, recovery_team)
            add_update(updates, teams, recovery_id, "fum_ret_yd", recovery_yards, recovery_team)
            if flag(row.get("touchdown")) and team_abbr(row.get("td_team")) == team_abbr(recovery_team):
                add_update(updates, teams, recovery_id, "fum_ret_td", 1, recovery_team)

    return_team = team_abbr(row.get("return_team"))
    return_yards = number(row.get("return_yards"))
    punt_returner = clean_id(row.get("punt_returner_player_id"))
    kickoff_returner = clean_id(row.get("kickoff_returner_player_id"))
    if punt_returner:
        add_update(updates, teams, punt_returner, "pr_yd", return_yards, return_team)
        if flag(row.get("return_touchdown")):
            add_update(updates, teams, punt_returner, "pr_td", 1, return_team)
            add_update(updates, teams, punt_returner, "ret_td", 1, return_team)
    if kickoff_returner:
        add_update(updates, teams, kickoff_returner, "kr_yd", return_yards, return_team)
        if flag(row.get("return_touchdown")):
            add_update(updates, teams, kickoff_returner, "kr_td", 1, return_team)
            add_update(updates, teams, kickoff_returner, "ret_td", 1, return_team)

    kicker = clean_id(row.get("kicker_player_id"))
    if kicker and flag(row.get("field_goal_attempt")):
        result = str(row.get("field_goal_result", "")).lower()
        made = result == "made"
        blocked = result == "blocked"
        distance = max(0.0, number(row.get("kick_distance")))
        add_update(updates, teams, kicker, "fgm" if made else "fgmiss", 1, offense)
        add_update(updates, teams, kicker, field_goal_bucket(distance, made), 1, offense)
        if distance < 40:
            add_update(updates, teams, kicker, "fgm_0_39" if made else "fgmiss_0_39", 1, offense)
        if distance >= 50:
            add_update(updates, teams, kicker, "fgm_50p" if made else "fgmiss_50p", 1, offense)
        if made:
            add_update(updates, teams, kicker, "fgm_yds", distance, offense)
            add_update(updates, teams, kicker, "fgm_yds_over_30", max(0.0, distance - 30), offense)
        if blocked and defense:
            add_update(updates, teams, f"DST:{defense}", "blk_kick", 1, defense)
    if kicker and flag(row.get("extra_point_attempt")):
        result = str(row.get("extra_point_result", "")).lower()
        add_update(updates, teams, kicker, "xpm" if result == "good" else "xpmiss", 1, offense)

    solo_fields = [
        ("solo_tackle_1_player_id", "solo_tackle_1_team"),
        ("solo_tackle_2_player_id", "solo_tackle_2_team"),
    ]
    for player_field, team_field in solo_fields:
        player_id = row.get(player_field)
        player_team = row.get(team_field) or defense
        add_update(updates, teams, player_id, "idp_tkl_solo", 1, player_team)
        add_update(updates, teams, player_id, "idp_tkl", 1, player_team)
    for index in range(1, 5):
        player_id = row.get(f"assist_tackle_{index}_player_id")
        player_team = row.get(f"assist_tackle_{index}_team") or defense
        add_update(updates, teams, player_id, "idp_tkl_ast", 1, player_team)
        add_update(updates, teams, player_id, "idp_tkl", 1, player_team)
    for field in ("tackle_for_loss_1_player_id", "tackle_for_loss_2_player_id"):
        add_update(updates, teams, row.get(field), "idp_tkl_loss", 1, defense)
    for field in ("qb_hit_1_player_id", "qb_hit_2_player_id"):
        add_update(updates, teams, row.get(field), "idp_qbhit", 1, defense)
    for index in (1, 2):
        add_update(
            updates,
            teams,
            row.get(f"forced_fumble_player_{index}_player_id"),
            "idp_ff",
            1,
            row.get(f"forced_fumble_player_{index}_team") or defense,
        )
    interception_id = row.get("interception_player_id")
    if clean_id(interception_id):
        add_update(updates, teams, interception_id, "idp_int", 1, defense)
        add_update(updates, teams, interception_id, "idp_int_ret_yd", return_yards, defense)
        if flag(row.get("touchdown")) and team_abbr(row.get("td_team")) == defense:
            add_update(updates, teams, interception_id, "idp_int_td", 1, defense)
            add_update(updates, teams, interception_id, "idp_def_td", 1, defense)
    for field in ("pass_defense_1_player_id", "pass_defense_2_player_id"):
        add_update(updates, teams, row.get(field), "idp_pd", 1, defense)
    full_sack = row.get("sack_player_id")
    add_update(updates, teams, full_sack, "idp_sack", 1, defense)
    add_update(
        updates,
        teams,
        full_sack,
        "idp_sack_yd",
        abs(min(0.0, number(row.get("yards_gained")))),
        defense,
    )
    for field in ("half_sack_1_player_id", "half_sack_2_player_id"):
        add_update(updates, teams, row.get(field), "idp_sack", 0.5, defense)
        add_update(
            updates,
            teams,
            row.get(field),
            "idp_sack_yd",
            abs(min(0.0, number(row.get("yards_gained")))) / 2,
            defense,
        )
    add_update(updates, teams, row.get("safety_player_id"), "idp_safety", 1, defense)
    blocked_player = row.get("blocked_player_id")
    if clean_id(blocked_player):
        add_update(updates, teams, blocked_player, "idp_blk_kick", 1, defense)

    if defense:
        dst = f"DST:{defense}"
        if flag(row.get("sack")):
            add_update(updates, teams, dst, "sack", 1, defense)
            add_update(
                updates,
                teams,
                dst,
                "sack_yd",
                abs(min(0.0, number(row.get("yards_gained")))),
                defense,
            )
        if flag(row.get("interception")):
            add_update(updates, teams, dst, "int", 1, defense)
            add_update(updates, teams, dst, "int_ret_yd", return_yards, defense)
        forced_fumbles = sum(
            1
            for index in (1, 2)
            if clean_id(row.get(f"forced_fumble_player_{index}_player_id"))
        )
        add_update(updates, teams, dst, "def_ff", forced_fumbles, defense)
        defensive_recoveries = sum(
            1 for _, recovery_team, _ in recoveries if team_abbr(recovery_team) == defense
        )
        add_update(updates, teams, dst, "fum_rec", defensive_recoveries, defense)
        if flag(row.get("touchdown")) and team_abbr(row.get("td_team")) == defense:
            add_update(updates, teams, dst, "def_td", 1, defense)
            if flag(row.get("interception")):
                add_update(updates, teams, dst, "def_int_td", 1, defense)
                if return_yards >= 50:
                    add_update(updates, teams, dst, "bonus_def_int_td_50p", 1, defense)
            if defensive_recoveries:
                add_update(updates, teams, dst, "def_fum_td", 1, defense)
                if max(number(item[2]) for item in recoveries) >= 50:
                    add_update(updates, teams, dst, "bonus_def_fum_td_50p", 1, defense)
        if flag(row.get("safety_player_id")) or str(row.get("play_type", "")).lower() == "safety":
            add_update(updates, teams, dst, "safe", 1, defense)
        add_update(
            updates,
            teams,
            dst,
            "def_pass_def",
            sum(1 for field in ("pass_defense_1_player_id", "pass_defense_2_player_id") if clean_id(row.get(field))),
            defense,
        )
        add_update(
            updates,
            teams,
            dst,
            "tkl_solo",
            sum(1 for player_field, _ in solo_fields if clean_id(row.get(player_field))),
            defense,
        )
        add_update(
            updates,
            teams,
            dst,
            "tkl_ast",
            sum(1 for index in range(1, 5) if clean_id(row.get(f"assist_tackle_{index}_player_id"))),
            defense,
        )
        add_update(
            updates,
            teams,
            dst,
            "tkl_loss",
            sum(1 for field in ("tackle_for_loss_1_player_id", "tackle_for_loss_2_player_id") if clean_id(row.get(field))),
            defense,
        )
        add_update(
            updates,
            teams,
            dst,
            "qb_hit",
            sum(1 for field in ("qb_hit_1_player_id", "qb_hit_2_player_id") if clean_id(row.get(field))),
            defense,
        )
        if flag(row.get("fourth_down_failed")):
            add_update(updates, teams, dst, "def_4_and_stop", 1, defense)
        if flag(row.get("punt_attempt")):
            add_update(updates, teams, dst, "def_forced_punts", 1, defense)
        if flag(row.get("pass_attempt")) or flag(row.get("rush_attempt")) or flag(row.get("sack")):
            add_update(updates, teams, dst, "yds_allow", number(row.get("yards_gained")), defense)
        score_delta = max(
            0.0,
            number(row.get("posteam_score_post")) - number(row.get("posteam_score")),
        )
        add_update(updates, teams, dst, "pts_allow", score_delta, defense)

    if return_team:
        return_dst = f"DST:{return_team}"
        if punt_returner:
            add_update(updates, teams, return_dst, "def_pr_yd", return_yards, return_team)
        if kickoff_returner:
            add_update(updates, teams, return_dst, "def_kr_yd", return_yards, return_team)
        if flag(row.get("return_touchdown")):
            add_update(updates, teams, return_dst, "st_td", 1, return_team)

    return updates, teams


def prepare_week(frame: pd.DataFrame, audit: ReconstructionAudit) -> PreparedWeek:
    games: Dict[str, Dict[str, Any]] = {}
    team_game: Dict[str, str] = {}
    entity_team_counts: DefaultDict[str, collections.Counter] = collections.defaultdict(
        collections.Counter
    )
    events: List[PreparedEvent] = []
    scoring_columns = [
        "pass_attempt", "rush_attempt", "field_goal_attempt", "extra_point_attempt",
        "interception", "sack", "fumble", "punt_attempt", "touchdown",
    ]
    for _, row_series in frame.sort_values(["_event_at", "_order"], na_position="last").iterrows():
        row = row_series.to_dict()
        is_scoring_relevant = any(flag(row.get(column)) for column in scoring_columns)
        if is_scoring_relevant:
            audit.timestamp_total += 1
            if pd.notna(row.get("_event_at")):
                audit.timestamp_present += 1
        if pd.isna(row.get("_event_at")):
            continue
        game_id = clean_id(row.get("game_id"))
        if not game_id:
            continue
        at_ns = int(pd.Timestamp(row["_event_at"]).value)
        home = team_abbr(row.get("home_team"))
        away = team_abbr(row.get("away_team"))
        game = games.setdefault(
            game_id,
            {
                "first": at_ns,
                "last": at_ns,
                "home": home,
                "away": away,
                "timeline": [],
            },
        )
        game["first"] = min(game["first"], at_ns)
        game["last"] = max(game["last"], at_ns)
        if home:
            team_game[home] = game_id
        if away:
            team_game[away] = game_id
        remaining = max(0.0, min(1.0, number(row.get("game_seconds_remaining"), 3600.0) / 3600.0))
        if number(row.get("qtr")) >= 5:
            remaining = max(remaining, 0.04)
        game["timeline"].append((at_ns, remaining))
        updates, teams = row_updates(row)
        for entity, team in teams:
            entity_team_counts[entity][team] += 1
        events.append(PreparedEvent(at_ns, game_id, remaining, updates, teams))
    events.sort(key=lambda event: event.at_ns)
    entity_team = {
        entity: counts.most_common(1)[0][0]
        for entity, counts in entity_team_counts.items()
        if counts
    }
    for game in games.values():
        game["timeline"].sort()
        game["times"] = np.asarray([item[0] for item in game["timeline"]], dtype=np.int64)
        game["remaining"] = np.asarray([item[1] for item in game["timeline"]], dtype=float)
    return PreparedWeek(events, games, team_game, entity_team)


def person_name_key(value: Any) -> Optional[str]:
    raw = clean_id(value)
    if not raw:
        return None
    tokens = re.findall(r"[a-z0-9]+", raw.lower())
    while tokens and tokens[-1] in {"jr", "sr", "ii", "iii", "iv", "v"}:
        tokens.pop()
    if len(tokens) < 2:
        return None
    surname = tokens[-1]
    if len(tokens) >= 3 and tokens[-2] in {"st", "de", "del", "la", "van", "von"}:
        surname = tokens[-2] + surname
    return tokens[0][0] + surname


def pbp_player_name_indexes(
    pbp_by_season: Mapping[int, pd.DataFrame],
) -> Tuple[DefaultDict[str, set], DefaultDict[Tuple[str, str], set]]:
    by_name: DefaultDict[str, set] = collections.defaultdict(set)
    by_name_team: DefaultDict[Tuple[str, str], set] = collections.defaultdict(set)
    for frame in pbp_by_season.values():
        for id_field, name_field, team_field in ENTITY_NAME_FIELDS:
            if id_field not in frame or name_field not in frame:
                continue
            columns = [id_field, name_field]
            if team_field in frame:
                columns.append(team_field)
            for row in frame[columns].dropna(subset=[id_field, name_field]).drop_duplicates().to_dict("records"):
                entity = clean_id(row.get(id_field))
                name = person_name_key(row.get(name_field))
                team = team_abbr(row.get(team_field))
                if not entity or not name:
                    continue
                by_name[name].add(entity)
                if team:
                    by_name_team[(name, team)].add(entity)
    return by_name, by_name_team


def build_player_maps(
    players: Mapping[str, Any],
    pbp_by_season: Mapping[int, pd.DataFrame],
) -> Tuple[Dict[str, str], Dict[str, Dict[str, Any]], Dict[str, str]]:
    sleeper_to_entity: Dict[str, str] = {}
    meta: Dict[str, Dict[str, Any]] = {}
    dst_by_team: Dict[str, str] = {}
    by_name, by_name_team = pbp_player_name_indexes(pbp_by_season)
    for player_id, raw in players.items():
        position = str(raw.get("position") or "").upper()
        team = team_abbr(raw.get("team"))
        gsis = clean_id(raw.get("gsis_id"))
        full_name = (
            clean_id(raw.get("full_name"))
            or " ".join(
                item
                for item in (
                    clean_id(raw.get("first_name")),
                    clean_id(raw.get("last_name")),
                )
                if item
            )
        )
        group = position_group(position)
        meta[str(player_id)] = {
            "position": position,
            "group": group,
            "team": team,
        }
        if group == "DEF":
            defense_team = team or team_abbr(player_id)
            if defense_team:
                entity = f"DST:{defense_team}"
                sleeper_to_entity[str(player_id)] = entity
                dst_by_team[defense_team] = str(player_id)
        elif gsis:
            sleeper_to_entity[str(player_id)] = gsis
        else:
            name = person_name_key(full_name)
            team_matches = by_name_team.get((name, team), set()) if name and team else set()
            name_matches = by_name.get(name, set()) if name else set()
            if len(team_matches) == 1:
                sleeper_to_entity[str(player_id)] = next(iter(team_matches))
            elif len(name_matches) == 1:
                sleeper_to_entity[str(player_id)] = next(iter(name_matches))
    return sleeper_to_entity, meta, dst_by_team


def derived_stats(stats: Mapping[str, float]) -> Dict[str, float]:
    result = dict(stats)
    result["bonus_pass_yd_300"] = 1.0 if number(stats.get("pass_yd")) >= 300 else 0.0
    result["bonus_pass_yd_400"] = 1.0 if number(stats.get("pass_yd")) >= 400 else 0.0
    result["bonus_rush_yd_100"] = 1.0 if number(stats.get("rush_yd")) >= 100 else 0.0
    result["bonus_rush_yd_200"] = 1.0 if number(stats.get("rush_yd")) >= 200 else 0.0
    result["bonus_rec_yd_100"] = 1.0 if number(stats.get("rec_yd")) >= 100 else 0.0
    result["bonus_rec_yd_200"] = 1.0 if number(stats.get("rec_yd")) >= 200 else 0.0
    combined_yards = number(stats.get("rush_yd")) + number(stats.get("rec_yd"))
    result["bonus_rush_rec_yd_100"] = 1.0 if combined_yards >= 100 else 0.0
    result["bonus_rush_rec_yd_200"] = 1.0 if combined_yards >= 200 else 0.0
    result["bonus_pass_cmp_25"] = 1.0 if number(stats.get("pass_cmp")) >= 25 else 0.0
    result["bonus_rush_att_20"] = 1.0 if number(stats.get("rush_att")) >= 20 else 0.0
    result["bonus_sack_2p"] = 1.0 if number(stats.get("idp_sack")) >= 2 else 0.0
    result["bonus_tkl_10p"] = 1.0 if number(stats.get("idp_tkl")) >= 10 else 0.0
    result["idp_pass_def_3p"] = 1.0 if number(stats.get("idp_pd")) >= 3 else 0.0
    points_allowed = max(0.0, number(stats.get("pts_allow")))
    yards_allowed = max(0.0, number(stats.get("yds_allow")))
    point_tiers = {
        "pts_allow_0": points_allowed == 0,
        "pts_allow_1_6": 1 <= points_allowed <= 6,
        "pts_allow_7_13": 7 <= points_allowed <= 13,
        "pts_allow_14_17": 14 <= points_allowed <= 17,
        "pts_allow_18_21": 18 <= points_allowed <= 21,
        "pts_allow_22_27": 22 <= points_allowed <= 27,
        "pts_allow_14_20": 14 <= points_allowed <= 20,
        "pts_allow_21_27": 21 <= points_allowed <= 27,
        "pts_allow_28_34": 28 <= points_allowed <= 34,
        "pts_allow_35_45": 35 <= points_allowed <= 45,
        "pts_allow_46p": points_allowed >= 46,
        "pts_allow_35p": points_allowed >= 35,
    }
    for key, active in point_tiers.items():
        result[key] = 1.0 if active else 0.0
    yard_tiers = {
        "yds_allow_0_100": yards_allowed < 100,
        "yds_allow_100_199": 100 <= yards_allowed <= 199,
        "yds_allow_200_299": 200 <= yards_allowed <= 299,
        "yds_allow_300_349": 300 <= yards_allowed <= 349,
        "yds_allow_350_399": 350 <= yards_allowed <= 399,
        "yds_allow_400_449": 400 <= yards_allowed <= 449,
        "yds_allow_450_499": 450 <= yards_allowed <= 499,
        "yds_allow_500_549": 500 <= yards_allowed <= 549,
        "yds_allow_550p": yards_allowed >= 550,
    }
    for key, active in yard_tiers.items():
        result[key] = 1.0 if active else 0.0
    return result


def score_stats(stats: Mapping[str, float], scoring: Mapping[str, float], position: str) -> float:
    values = derived_stats(stats)
    pos = str(position or "").upper()
    is_defense = pos in {"DEF", "DST", "D/ST"}
    points = sum(
        number(values.get(key)) * number(scoring.get(key))
        for key in DIRECT_SCORING_KEYS
        if is_defense
        or not key.startswith(("pts_allow_", "yds_allow_"))
    )
    receptions = number(values.get("rec"))
    if pos == "TE":
        points += receptions * number(scoring.get("bonus_rec_te"))
    if pos == "RB":
        points += receptions * number(scoring.get("bonus_rec_rb"))
        points += number(values.get("rush_att")) * number(scoring.get("bonus_rush_att"))
    if pos == "WR":
        points += receptions * number(scoring.get("bonus_rec_wr"))
    if pos == "QB":
        points += (
            number(values.get("pass_fd")) + number(values.get("rush_fd"))
        ) * number(scoring.get("bonus_fd_qb"))
    if pos == "RB":
        points += (
            number(values.get("rush_fd")) + number(values.get("rec_fd"))
        ) * number(scoring.get("bonus_fd_rb"))
    if pos == "WR":
        points += number(values.get("rec_fd")) * number(scoring.get("bonus_fd_wr"))
    if pos == "TE":
        points += number(values.get("rec_fd")) * number(scoring.get("bonus_fd_te"))
    return round(points, 4)


def paired_matchups(rows: Sequence[Mapping[str, Any]]) -> List[Tuple[Mapping[str, Any], Mapping[str, Any]]]:
    groups: DefaultDict[str, List[Mapping[str, Any]]] = collections.defaultdict(list)
    for row in rows or []:
        matchup_id = row.get("matchup_id")
        if matchup_id is not None:
            groups[str(matchup_id)].append(row)
    return [
        (group[0], group[1])
        for group in groups.values()
        if len(group) == 2
    ]


def official_row_points(row: Mapping[str, Any]) -> float:
    return number(row.get("points")) + number(row.get("custom_points"))


def prior_projection(
    history: Mapping[str, List[Tuple[int, float]]],
    player_id: str,
    week: int,
    group: str,
) -> Tuple[float, float]:
    values = [
        points
        for historical_week, points in history.get(player_id, [])
        if historical_week < week and points > 0
    ]
    default = POSITION_DEFAULT_PROJECTION.get(group, POSITION_DEFAULT_PROJECTION["FLEX"])
    if not values:
        return default, default * 0.60
    season_average = sum(values) / len(values)
    if len(values) == 1:
        return season_average, max(2.0, season_average * 0.50)
    recent = values[-4:]
    recent_average = sum(recent) / len(recent)
    weight = RECENT_WEIGHT.get(group, RECENT_WEIGHT["FLEX"])
    projection = recent_average * weight + season_average * (1 - weight)
    if len(values) >= 4:
        sigma = float(np.std(np.asarray(values, dtype=float), ddof=1))
    else:
        sigma = projection * 0.45
    return max(0.0, projection), max(2.0, sigma)


def build_history(context: Mapping[str, Any]) -> Dict[str, List[Tuple[int, float]]]:
    history: DefaultDict[str, List[Tuple[int, float]]] = collections.defaultdict(list)
    for week, rows in context["matchups"].items():
        seen = set()
        for row in rows or []:
            for player_id, points in (row.get("players_points") or {}).items():
                key = (str(player_id), int(week))
                if key in seen:
                    continue
                seen.add(key)
                history[str(player_id)].append((int(week), number(points)))
    return dict(history)


def game_remaining(game: Mapping[str, Any], at_ns: int) -> float:
    if at_ns < game["first"]:
        return 1.0
    if at_ns >= game["last"]:
        return 0.0
    index = int(np.searchsorted(game["times"], at_ns, side="right") - 1)
    if index < 0:
        return 1.0
    return float(game["remaining"][index])


def sample_times(prepared: PreparedWeek) -> List[int]:
    if not prepared.games:
        return []
    last = max(game["last"] for game in prepared.games.values())
    step = SNAPSHOT_MINUTES * 60 * 1_000_000_000
    samples = set()
    for game in prepared.games.values():
        samples.add(game["first"] - 1)
        samples.add(game["last"])
        current = game["first"]
        while current < game["last"]:
            samples.add(current)
            current += step
    return sorted(value for value in samples if value < last)


def apply_events(
    events: Sequence[PreparedEvent],
) -> DefaultDict[str, DefaultDict[str, float]]:
    stats: DefaultDict[str, DefaultDict[str, float]] = collections.defaultdict(
        lambda: collections.defaultdict(float)
    )
    for event in events:
        for entity, stat, value in event.updates:
            stats[entity][stat] += value
    return stats


def mapping_group(meta: Mapping[str, Any]) -> str:
    group = meta.get("group", "FLEX")
    return "IDP" if group == "IDP" else "OFFENSE_K_DST"


def side_starters(
    row: Mapping[str, Any],
    sleeper_to_entity: Mapping[str, str],
    player_meta: Mapping[str, Mapping[str, Any]],
    prepared: PreparedWeek,
    audit: ReconstructionAudit,
) -> Tuple[List[Dict[str, Any]], bool]:
    starters = []
    valid = True
    for raw_player_id in row.get("starters") or []:
        player_id = str(raw_player_id)
        if player_id == "0":
            continue
        meta = player_meta.get(player_id, {"position": "", "group": "FLEX", "team": None})
        coverage_group = mapping_group(meta)
        audit.mapping_total[coverage_group] += 1
        entity = sleeper_to_entity.get(player_id)
        if not entity:
            valid = False
            continue
        audit.mapped[coverage_group] += 1
        team = prepared.entity_team.get(entity) or meta.get("team")
        if str(entity).startswith("DST:"):
            team = str(entity).split(":", 1)[1]
        if not team or team not in prepared.team_game:
            valid = False
        starters.append(
            {
                "playerId": player_id,
                "entity": entity,
                "position": meta.get("position", ""),
                "group": meta.get("group", "FLEX"),
                "team": team,
            }
        )
    return starters, valid


def build_dataset(
    contexts: Sequence[Mapping[str, Any]],
    pbp_by_season: Mapping[int, pd.DataFrame],
    sleeper_to_entity: Mapping[str, str],
    player_meta: Mapping[str, Mapping[str, Any]],
) -> Tuple[Dict[str, np.ndarray], ReconstructionAudit]:
    audit = ReconstructionAudit()
    snapshots: List[Dict[str, Any]] = []
    starter_records: List[Dict[str, Any]] = []
    histories = {context["cacheKey"]: build_history(context) for context in contexts}
    prepared_cache: Dict[Tuple[int, int], PreparedWeek] = {}

    for context in sorted(contexts, key=lambda item: (item["season"], item["cacheKey"])):
        season = context["season"]
        scoring = context["scoring"]
        unsupported = {
            key for key, value in scoring.items()
            if value and key not in SUPPORTED_SCORING_KEYS
        }
        audit.unsupported_scoring_keys.update(unsupported)
        for week in REGULAR_SEASON_WEEKS:
            cache_key = (season, week)
            if cache_key not in prepared_cache:
                frame = pbp_by_season[season]
                prepared_cache[cache_key] = prepare_week(
                    frame.loc[frame["week"] == week],
                    audit,
                )
            prepared = prepared_cache[cache_key]
            if not prepared.events:
                continue
            final_stats = apply_events(prepared.events)
            for left_row, right_row in paired_matchups(context["matchups"].get(week) or []):
                audit.paired_matchups[season] += 1
                is_late = season == EVALUATION_SEASON and week >= 15
                if is_late:
                    audit.late_matchups += 1
                left_starters, left_mapping_ok = side_starters(
                    left_row, sleeper_to_entity, player_meta, prepared, audit
                )
                right_starters, right_mapping_ok = side_starters(
                    right_row, sleeper_to_entity, player_meta, prepared, audit
                )
                if not left_mapping_ok or not right_mapping_ok:
                    continue
                reconstructed_left = sum(
                    score_stats(final_stats[item["entity"]], scoring, item["position"])
                    for item in left_starters
                )
                reconstructed_right = sum(
                    score_stats(final_stats[item["entity"]], scoring, item["position"])
                    for item in right_starters
                )
                official_left = number(left_row.get("points"))
                official_right = number(right_row.get("points"))
                errors = [
                    abs(reconstructed_left - official_left),
                    abs(reconstructed_right - official_right),
                ]
                audit.side_errors.extend(errors)
                tolerances = [
                    max(1.5, abs(official_left) * 0.015),
                    max(1.5, abs(official_right) * 0.015),
                ]
                if any(error > tolerance for error, tolerance in zip(errors, tolerances)):
                    continue
                audit.reconciled_matchups[season] += 1
                if is_late:
                    audit.reconciled_late_matchups += 1

                matchup_key = (
                    f"{season}:{context['cacheKey']}:{week}:"
                    f"{left_row.get('matchup_id')}"
                )
                official_margin = official_row_points(left_row) - official_row_points(right_row)
                outcome = 1.0 if official_margin > 0 else 0.0 if official_margin < 0 else 0.5
                projections: Dict[Tuple[int, str], Tuple[float, float]] = {}
                for sign, side in ((1, left_starters), (-1, right_starters)):
                    for starter in side:
                        projection, sigma = prior_projection(
                            histories[context["cacheKey"]],
                            starter["playerId"],
                            week,
                            starter["group"],
                        )
                        projections[(sign, starter["playerId"])] = (projection, sigma)

                stats: DefaultDict[str, DefaultDict[str, float]] = collections.defaultdict(
                    lambda: collections.defaultdict(float)
                )
                event_index = 0
                events = prepared.events
                for at_ns in sample_times(prepared):
                    while event_index < len(events) and events[event_index].at_ns <= at_ns:
                        for entity, stat, value in events[event_index].updates:
                            stats[entity][stat] += value
                        event_index += 1
                    current_margin = 0.0
                    local_records = []
                    any_unsettled = False
                    total_projection = 0.0
                    remaining_projection = 0.0
                    for sign, side in ((1, left_starters), (-1, right_starters)):
                        for starter in side:
                            current = score_stats(
                                stats[starter["entity"]],
                                scoring,
                                starter["position"],
                            )
                            game_id = prepared.team_game.get(starter["team"])
                            remaining = (
                                game_remaining(prepared.games[game_id], at_ns)
                                if game_id in prepared.games else 1.0
                            )
                            if remaining > 0:
                                any_unsettled = True
                            projection, sigma = projections[(sign, starter["playerId"])]
                            current_margin += sign * current
                            total_projection += projection
                            remaining_projection += projection * remaining
                            local_records.append(
                                {
                                    "sign": sign,
                                    "current": current,
                                    "projection": projection,
                                    "remaining": remaining,
                                    "sigma": sigma,
                                }
                            )
                    if not any_unsettled:
                        continue
                    snapshot_index = len(snapshots)
                    progress = (
                        1.0 - remaining_projection / total_projection
                        if total_projection > 0 else 0.0
                    )
                    snapshots.append(
                        {
                            "matchupKey": matchup_key,
                            "season": season,
                            "week": week,
                            "outcome": outcome,
                            "currentMargin": current_margin,
                            "progress": max(0.0, min(1.0, progress)),
                            "late": 1 if is_late else 0,
                        }
                    )
                    for record in local_records:
                        starter_records.append({"snapshot": snapshot_index, **record})

    if not snapshots:
        return empty_dataset(), audit
    matchup_counts = collections.Counter(row["matchupKey"] for row in snapshots)
    snapshot_weights = np.asarray(
        [1.0 / matchup_counts[row["matchupKey"]] for row in snapshots],
        dtype=float,
    )
    return {
        "season": np.asarray([row["season"] for row in snapshots], dtype=int),
        "week": np.asarray([row["week"] for row in snapshots], dtype=int),
        "outcome": np.asarray([row["outcome"] for row in snapshots], dtype=float),
        "currentMargin": np.asarray([row["currentMargin"] for row in snapshots], dtype=float),
        "progress": np.asarray([row["progress"] for row in snapshots], dtype=float),
        "late": np.asarray([row["late"] for row in snapshots], dtype=int),
        "weight": snapshot_weights,
        "matchupKey": np.asarray([row["matchupKey"] for row in snapshots], dtype=object),
        "recordSnapshot": np.asarray([row["snapshot"] for row in starter_records], dtype=int),
        "recordSign": np.asarray([row["sign"] for row in starter_records], dtype=float),
        "recordCurrent": np.asarray([row["current"] for row in starter_records], dtype=float),
        "recordProjection": np.asarray([row["projection"] for row in starter_records], dtype=float),
        "recordRemaining": np.asarray([row["remaining"] for row in starter_records], dtype=float),
        "recordSigma": np.asarray([row["sigma"] for row in starter_records], dtype=float),
    }, audit


def empty_dataset() -> Dict[str, np.ndarray]:
    return {
        "season": np.asarray([], dtype=int),
        "week": np.asarray([], dtype=int),
        "outcome": np.asarray([], dtype=float),
        "currentMargin": np.asarray([], dtype=float),
        "progress": np.asarray([], dtype=float),
        "late": np.asarray([], dtype=int),
        "weight": np.asarray([], dtype=float),
        "matchupKey": np.asarray([], dtype=object),
        "recordSnapshot": np.asarray([], dtype=int),
        "recordSign": np.asarray([], dtype=float),
        "recordCurrent": np.asarray([], dtype=float),
        "recordProjection": np.asarray([], dtype=float),
        "recordRemaining": np.asarray([], dtype=float),
        "recordSigma": np.asarray([], dtype=float),
    }


def normal_cdf(values: np.ndarray) -> np.ndarray:
    z = np.asarray(values, dtype=float)
    absolute = np.abs(z)
    t = 1.0 / (1.0 + 0.2316419 * absolute)
    density = 0.3989423 * np.exp(-(absolute ** 2) / 2.0)
    tail = density * t * (
        0.3193815
        + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))
    )
    return np.where(z > 0, 1.0 - tail, tail)


def probabilities(
    dataset: Mapping[str, np.ndarray],
    mask: np.ndarray,
    parameters: Mapping[str, Any],
) -> np.ndarray:
    snapshot_indices = np.flatnonzero(mask)
    remap = np.full(len(dataset["season"]), -1, dtype=int)
    remap[snapshot_indices] = np.arange(len(snapshot_indices))
    record_snapshot = dataset["recordSnapshot"]
    record_mask = mask[record_snapshot]
    local_snapshot = remap[record_snapshot[record_mask]]
    projection = dataset["recordProjection"][record_mask]
    current = dataset["recordCurrent"][record_mask]
    remaining = dataset["recordRemaining"][record_mask]
    sign = dataset["recordSign"][record_mask]
    sigma = dataset["recordSigma"][record_mask]
    base = projection * remaining
    pace_delta = current - projection * (1.0 - remaining)
    carryover = np.clip(
        parameters["paceCarryover"] * pace_delta * remaining,
        -0.5 * base,
        0.5 * base,
    )
    expected_addition = np.bincount(
        local_snapshot,
        weights=sign * np.maximum(0.0, base + carryover),
        minlength=len(snapshot_indices),
    )
    variance = np.bincount(
        local_snapshot,
        weights=(sigma ** 2) * (remaining ** parameters["remainingExponent"]),
        minlength=len(snapshot_indices),
    )
    expected_margin = dataset["currentMargin"][mask] + expected_addition
    matchup_sigma = np.maximum(
        parameters["sigmaFloor"],
        np.sqrt(np.maximum(0.0, variance)) * parameters["sigmaScale"],
    )
    probability = np.clip(normal_cdf(expected_margin / matchup_sigma), 0.001, 0.999)
    return apply_calibration(probability, parameters.get("calibrationKnots"))


def apply_calibration(
    probability: np.ndarray,
    knots: Optional[Sequence[Mapping[str, float]]],
) -> np.ndarray:
    if not knots:
        return probability
    ordered = sorted(
        (
            (number(item.get("raw")), number(item.get("calibrated")))
            for item in knots
        ),
        key=lambda item: item[0],
    )
    raw = np.asarray([item[0] for item in ordered], dtype=float)
    calibrated = np.asarray([item[1] for item in ordered], dtype=float)
    if len(raw) < 2 or np.any(np.diff(raw) <= 0):
        raise RuntimeError("Calibration knots must have strictly increasing raw values.")
    return np.clip(np.interp(probability, raw, calibrated), 0.001, 0.999)


def weighted_pava(values: Sequence[float], weights: Sequence[float]) -> List[float]:
    blocks: List[Dict[str, Any]] = []
    for index, (value, weight) in enumerate(zip(values, weights)):
        blocks.append(
            {
                "start": index,
                "end": index,
                "weight": float(weight),
                "value": float(value),
            }
        )
        while len(blocks) >= 2 and blocks[-2]["value"] > blocks[-1]["value"]:
            right = blocks.pop()
            left = blocks.pop()
            total_weight = left["weight"] + right["weight"]
            blocks.append(
                {
                    "start": left["start"],
                    "end": right["end"],
                    "weight": total_weight,
                    "value": (
                        left["value"] * left["weight"]
                        + right["value"] * right["weight"]
                    ) / total_weight,
                }
            )
    fitted = [0.5] * len(values)
    for block in blocks:
        for index in range(block["start"], block["end"] + 1):
            fitted[index] = block["value"]
    return fitted


def fit_symmetric_calibration_knots(
    raw_probability: np.ndarray,
    outcome: np.ndarray,
    weights: np.ndarray,
) -> List[Dict[str, float]]:
    if not len(raw_probability):
        return identity_calibration_knots()
    favored_probability = np.maximum(raw_probability, 1.0 - raw_probability)
    favored_outcome = np.where(raw_probability >= 0.5, outcome, 1.0 - outcome)
    edges = np.linspace(0.5, 1.0, 11)
    raw_centers: List[float] = []
    observed: List[float] = []
    bin_weights: List[float] = []
    for index in range(len(edges) - 1):
        lower, upper = edges[index], edges[index + 1]
        selected = (favored_probability >= lower) & (
            favored_probability <= upper if index == len(edges) - 2
            else favored_probability < upper
        )
        if not np.any(selected):
            continue
        bin_weight = float(np.sum(weights[selected]))
        if bin_weight <= 0:
            continue
        raw_centers.append(weighted_mean(favored_probability[selected], weights[selected]))
        observed.append(weighted_mean(favored_outcome[selected], weights[selected]))
        bin_weights.append(bin_weight)
    if not raw_centers:
        return identity_calibration_knots()
    monotonic = weighted_pava(
        [max(0.5, min(0.999, item)) for item in observed],
        bin_weights,
    )
    right: List[Tuple[float, float]] = [(0.5, 0.5)]
    for raw, calibrated in zip(raw_centers, monotonic):
        raw = max(0.500001, min(0.999, raw))
        calibrated = max(right[-1][1], min(0.999, calibrated))
        if raw <= right[-1][0]:
            continue
        right.append((raw, calibrated))
    if right[-1][0] < 1.0:
        right.append((1.0, right[-1][1]))
    left = [(1.0 - raw, 1.0 - calibrated) for raw, calibrated in reversed(right[1:])]
    combined = left + right
    return [
        {"raw": round(raw, 6), "calibrated": round(calibrated, 6)}
        for raw, calibrated in combined
    ]


def weighted_mean(values: np.ndarray, weights: np.ndarray) -> float:
    denominator = float(np.sum(weights))
    return float(np.sum(values * weights) / denominator) if denominator > 0 else float("nan")


def metrics(probability: np.ndarray, outcome: np.ndarray, weights: np.ndarray) -> Dict[str, float]:
    if not len(probability):
        return {
            "snapshots": 0,
            "brier": float("nan"),
            "logLoss": float("nan"),
            "ece": float("nan"),
            "sharpness": float("nan"),
        }
    clipped = np.clip(probability, 0.001, 0.999)
    brier = weighted_mean((clipped - outcome) ** 2, weights)
    log_loss = weighted_mean(
        -(outcome * np.log(clipped) + (1.0 - outcome) * np.log(1.0 - clipped)),
        weights,
    )
    sharpness = weighted_mean((clipped - 0.5) ** 2, weights)
    ece = 0.0
    total_weight = float(np.sum(weights))
    for lower in np.linspace(0.0, 0.9, 10):
        upper = lower + 0.1
        bin_mask = (clipped >= lower) & (
            clipped <= upper if upper >= 1.0 else clipped < upper
        )
        if not np.any(bin_mask):
            continue
        bin_weight = float(np.sum(weights[bin_mask]))
        predicted = weighted_mean(clipped[bin_mask], weights[bin_mask])
        observed = weighted_mean(outcome[bin_mask], weights[bin_mask])
        ece += (bin_weight / total_weight) * abs(predicted - observed)
    return {
        "snapshots": int(len(probability)),
        "brier": round(brier, 6),
        "logLoss": round(log_loss, 6),
        "ece": round(ece, 6),
        "sharpness": round(sharpness, 6),
    }


def objective(
    dataset: Mapping[str, np.ndarray],
    mask: np.ndarray,
    parameters: Mapping[str, Any],
) -> float:
    probability = probabilities(dataset, mask, parameters)
    return metrics(
        probability,
        dataset["outcome"][mask],
        dataset["weight"][mask],
    )["brier"]


def fit_parameters(dataset: Mapping[str, np.ndarray], train_mask: np.ndarray) -> Dict[str, Any]:
    parameters = neutral_parameters()
    grids = [
        ("paceCarryover", np.round(np.arange(-0.50, 0.501, 0.05), 2)),
        ("remainingExponent", np.round(np.arange(0.50, 1.501, 0.05), 2)),
        ("sigmaScale", np.round(np.arange(0.60, 2.001, 0.05), 2)),
        ("sigmaFloor", np.arange(3.0, 8.01, 0.5)),
    ]
    for _ in range(2):
        for key, values in grids:
            candidates = []
            for value in values:
                candidate = dict(parameters)
                candidate[key] = float(value)
                candidates.append((objective(dataset, train_mask, candidate), float(value)))
            candidates.sort(key=lambda item: (item[0], abs(item[1] - parameters[key])))
            parameters[key] = candidates[0][1]
    raw_training = probabilities(
        dataset,
        train_mask,
        {**parameters, "calibrationKnots": identity_calibration_knots()},
    )
    parameters["calibrationKnots"] = fit_symmetric_calibration_knots(
        raw_training,
        dataset["outcome"][train_mask],
        dataset["weight"][train_mask],
    )
    return parameters


def identity_calibration_knots() -> List[Dict[str, float]]:
    return [
        {"raw": 0.0, "calibrated": 0.0},
        {"raw": 0.5, "calibrated": 0.5},
        {"raw": 1.0, "calibrated": 1.0},
    ]


def neutral_parameters() -> Dict[str, Any]:
    return {
        "paceCarryover": 0.0,
        "remainingExponent": 1.0,
        "sigmaScale": 1.0,
        "sigmaFloor": 3.0,
        "calibrationKnots": identity_calibration_knots(),
    }


def finite_or_none(value: float) -> Optional[float]:
    return round(float(value), 6) if math.isfinite(float(value)) else None


def metric_json(value: Mapping[str, float]) -> Dict[str, Any]:
    return {
        key: finite_or_none(item) if isinstance(item, float) else item
        for key, item in value.items()
    }


def gate(name: str, passed: bool, detail: str) -> Dict[str, Any]:
    return {"name": name, "passed": bool(passed), "detail": detail}


def evaluate_gates(
    dataset: Mapping[str, np.ndarray],
    audit: ReconstructionAudit,
    baseline: Mapping[str, Mapping[str, float]],
    candidate: Mapping[str, Mapping[str, float]],
) -> List[Dict[str, Any]]:
    timestamp_coverage = (
        audit.timestamp_present / audit.timestamp_total
        if audit.timestamp_total else 0.0
    )
    offense_total = audit.mapping_total["OFFENSE_K_DST"]
    idp_total = audit.mapping_total["IDP"]
    offense_mapping = audit.mapped["OFFENSE_K_DST"] / offense_total if offense_total else 1.0
    idp_mapping = audit.mapped["IDP"] / idp_total if idp_total else 1.0
    total_paired = sum(audit.paired_matchups.values())
    total_reconciled = sum(audit.reconciled_matchups.values())
    survival = total_reconciled / total_paired if total_paired else 0.0
    train_matchups = len(set(dataset["matchupKey"][np.isin(dataset["season"], TRAINING_SEASONS)]))
    eval_matchups = len(set(dataset["matchupKey"][dataset["season"] == EVALUATION_SEASON]))
    late_matchups = len(set(dataset["matchupKey"][(dataset["season"] == EVALUATION_SEASON) & (dataset["late"] == 1)]))
    eval_baseline = baseline["evaluation"]
    eval_candidate = candidate["evaluation"]
    late_candidate = candidate["late"]
    ece_improvement = (
        (eval_baseline["ece"] - eval_candidate["ece"]) / eval_baseline["ece"]
        if eval_baseline["ece"] and math.isfinite(eval_baseline["ece"]) else 0.0
    )
    sharpness_ratio = (
        eval_candidate["sharpness"] / eval_baseline["sharpness"]
        if eval_baseline["sharpness"] and math.isfinite(eval_baseline["sharpness"]) else 0.0
    )
    return [
        gate("timestampCoverage", timestamp_coverage >= 0.99, f"{timestamp_coverage:.1%} (minimum 99%)"),
        gate("offenseKDstMapping", offense_mapping >= 0.98, f"{offense_mapping:.1%} (minimum 98%)"),
        gate("idpMapping", idp_mapping >= 0.95, f"{idp_mapping:.1%} (minimum 95%)"),
        gate("supportedScoring", not audit.unsupported_scoring_keys, f"{len(audit.unsupported_scoring_keys)} unsupported nonzero keys"),
        gate("reconstructionSurvival", survival >= 0.70, f"{survival:.1%} (minimum 70%)"),
        gate("trainingMatchups", train_matchups >= 250, f"{train_matchups} (minimum 250)"),
        gate("evaluationMatchups", eval_matchups >= 60, f"{eval_matchups} (minimum 60)"),
        gate("lateEvaluationMatchups", late_matchups >= 60, f"{late_matchups} (minimum 60)"),
        gate("snapshotCount", len(dataset["season"]) >= 4000, f"{len(dataset['season'])} (minimum 4,000)"),
        gate("evaluationEce", eval_candidate["ece"] <= 0.04, f"{eval_candidate['ece']:.4f} (maximum 0.0400)"),
        gate(
            "evaluationEceImprovement",
            eval_baseline["ece"] <= 0.04 or ece_improvement >= 0.15,
            f"{ece_improvement:.1%} relative improvement when required",
        ),
        gate(
            "evaluationBrier",
            eval_candidate["brier"] <= eval_baseline["brier"] + 0.002,
            f"{eval_candidate['brier'] - eval_baseline['brier']:+.4f} versus baseline (maximum +0.0020)",
        ),
        gate(
            "evaluationLogLoss",
            eval_candidate["logLoss"] <= eval_baseline["logLoss"] + 0.005,
            f"{eval_candidate['logLoss'] - eval_baseline['logLoss']:+.4f} versus baseline (maximum +0.0050)",
        ),
        gate(
            "sharpness",
            sharpness_ratio >= 0.90,
            f"{sharpness_ratio:.1%} of baseline (minimum 90%)",
        ),
        gate(
            "lateEvaluationEce",
            late_candidate["ece"] <= 0.07,
            f"{late_candidate['ece']:.4f} (maximum 0.0700)",
        ),
    ]


def evaluate_model(
    dataset: Mapping[str, np.ndarray],
    parameters: Mapping[str, float],
) -> Dict[str, Dict[str, float]]:
    masks = {
        "training": np.isin(dataset["season"], TRAINING_SEASONS),
        "evaluation": dataset["season"] == EVALUATION_SEASON,
        "evaluationWeeks1To14": (
            (dataset["season"] == EVALUATION_SEASON) & (dataset["week"] <= 14)
        ),
        "late": (
            (dataset["season"] == EVALUATION_SEASON) & (dataset["week"] >= 15)
        ),
        "early": (
            (dataset["season"] == EVALUATION_SEASON) & (dataset["progress"] < 1 / 3)
        ),
        "middle": (
            (dataset["season"] == EVALUATION_SEASON)
            & (dataset["progress"] >= 1 / 3)
            & (dataset["progress"] < 2 / 3)
        ),
        "lateGame": (
            (dataset["season"] == EVALUATION_SEASON) & (dataset["progress"] >= 2 / 3)
        ),
    }
    output = {}
    for name, mask in masks.items():
        probability = probabilities(dataset, mask, parameters)
        output[name] = metrics(
            probability,
            dataset["outcome"][mask],
            dataset["weight"][mask],
        )
    return output


def aggregate_counts(
    contexts: Sequence[Mapping[str, Any]],
    dataset: Mapping[str, np.ndarray],
    audit: ReconstructionAudit,
) -> Dict[str, Any]:
    return {
        "leagueSeasons": {
            str(season): sum(1 for context in contexts if context["season"] == season)
            for season in (*TRAINING_SEASONS, EVALUATION_SEASON)
        },
        "pairedMatchups": {
            str(season): audit.paired_matchups[season]
            for season in (*TRAINING_SEASONS, EVALUATION_SEASON)
        },
        "reconciledMatchups": {
            str(season): audit.reconciled_matchups[season]
            for season in (*TRAINING_SEASONS, EVALUATION_SEASON)
        },
        "latePairedMatchups": audit.late_matchups,
        "lateReconciledMatchups": audit.reconciled_late_matchups,
        "snapshots": int(len(dataset["season"])),
        "trainingSnapshots": int(np.sum(np.isin(dataset["season"], TRAINING_SEASONS))),
        "evaluationSnapshots": int(np.sum(dataset["season"] == EVALUATION_SEASON)),
    }


def candidate_payload(
    status: str,
    selected: Mapping[str, Any],
    fitted: Optional[Mapping[str, Any]],
    gates: Sequence[Mapping[str, Any]],
    counts: Mapping[str, Any],
    baseline_metrics: Optional[Mapping[str, Any]],
    candidate_metrics: Optional[Mapping[str, Any]],
    failure: Optional[str] = None,
) -> Dict[str, Any]:
    failed = [item["name"] for item in gates if not item["passed"]]
    return {
        "schemaVersion": 1,
        "modelId": "live-win-probability-offline-v1",
        "status": status,
        "selectedParameters": dict(selected),
        "fittedCandidate": dict(fitted) if fitted else None,
        "runtimeModel": runtime_model_contract(selected, status),
        "trainingSeasons": list(TRAINING_SEASONS),
        "evaluationSeason": EVALUATION_SEASON,
        "counts": counts,
        "gates": list(gates),
        "failedGates": failed,
        "metrics": {
            "baseline": baseline_metrics,
            "candidate": candidate_metrics,
        },
        "failure": failure,
    }


def runtime_model_contract(
    parameters: Mapping[str, Any],
    status: str,
) -> Dict[str, Any]:
    sigma_scale = number(parameters.get("sigmaScale"), 1.0)
    return {
        "schemaVersion": 1,
        "modelId": "live-win-probability-offline-v1",
        "status": (
            "calibrated-candidate"
            if status == "calibrated-candidate"
            else "neutral-fallback"
        ),
        "trainedThrough": (
            EVALUATION_SEASON - 1
            if status == "calibrated-candidate"
            else None
        ),
        "mean": {
            "paceCarryover": number(parameters.get("paceCarryover")),
            "carryoverClamp": 0.5,
        },
        "variance": {
            "remainingExponent": number(parameters.get("remainingExponent"), 1.0),
            "matchupSigmaFloor": number(parameters.get("sigmaFloor"), 3.0),
            # A uniform position multiplier is algebraically identical to the
            # fitted global sigma scale in the current runtime.
            "positionScale": {
                position: sigma_scale
                for position in ("QB", "RB", "WR", "TE", "K", "DEF", "IDP", "FLEX")
            },
            "sourceScale": {
                "projection": 1.0,
                "seasonAvg": 1.0,
                "posDefault": 1.0,
            },
        },
        "calibration": {
            "method": "symmetric-linear-v1",
            "knots": list(
                parameters.get("calibrationKnots")
                or identity_calibration_knots()
            ),
        },
        "guardrails": {
            "unsettledMinimum": 0.001,
            "unsettledMaximum": 0.999,
        },
        "provenance": {
            "trainingSeasons": list(TRAINING_SEASONS),
            "evaluationSeason": EVALUATION_SEASON,
        },
    }


def format_metric(value: Any) -> str:
    return "—" if value is None or not math.isfinite(number(value, float("nan"))) else f"{float(value):.4f}"


def render_report(payload: Mapping[str, Any], audit: ReconstructionAudit) -> str:
    counts = payload.get("counts") or {}
    baseline = (payload.get("metrics") or {}).get("baseline") or {}
    candidate = (payload.get("metrics") or {}).get("candidate") or {}
    selected = payload.get("selectedParameters") or neutral_parameters()
    fitted = payload.get("fittedCandidate")
    lines = [
        "# Win Probability Backtest Report",
        "",
        "## Result",
        "",
        f"- Status: **{payload.get('status', 'failed')}**",
        f"- Selected runtime recommendation: `{json.dumps(payload.get('runtimeModel'), sort_keys=True)}`",
        "- The fitted coefficients are diagnostic only and must not replace the neutral runtime while any gate fails.",
        "- Historical league identifiers, labels, raw plays, and matchup rows are intentionally omitted.",
    ]
    if payload.get("failure"):
        lines.append(f"- Pipeline failure: `{payload['failure']}`")
    lines.extend(
        [
            "",
            "## Aggregate Sample",
            "",
            "| Season | League-seasons | Paired matchups | Reconciled matchups |",
            "| --- | ---: | ---: | ---: |",
        ]
    )
    for season in (*TRAINING_SEASONS, EVALUATION_SEASON):
        season_key = str(season)
        lines.append(
            f"| {season} | {(counts.get('leagueSeasons') or {}).get(season_key, 0)} "
            f"| {(counts.get('pairedMatchups') or {}).get(season_key, 0)} "
            f"| {(counts.get('reconciledMatchups') or {}).get(season_key, 0)} |"
        )
    lines.extend(
        [
            "",
            f"- Total unsettled snapshots: **{counts.get('snapshots', 0):,}**",
            f"- 2025 Weeks 15–18 paired/reconciled matchups: "
            f"**{counts.get('latePairedMatchups', 0)} / {counts.get('lateReconciledMatchups', 0)}**",
            "",
            "## Holdout Metrics",
            "",
            "| Scope | Model | Brier | Log loss | ECE | Sharpness | Snapshots |",
            "| --- | --- | ---: | ---: | ---: | ---: | ---: |",
        ]
    )
    for scope in ("evaluation", "evaluationWeeks1To14", "late", "early", "middle", "lateGame"):
        for model_name, metric_set in (("Neutral", baseline), ("Fitted", candidate)):
            row = metric_set.get(scope) or {}
            lines.append(
                f"| {scope} | {model_name} | {format_metric(row.get('brier'))} "
                f"| {format_metric(row.get('logLoss'))} | {format_metric(row.get('ece'))} "
                f"| {format_metric(row.get('sharpness'))} | {row.get('snapshots', 0)} |"
            )
    lines.extend(["", "## Candidate Parameters", ""])
    lines.append(
        f"- Fitted candidate: `{json.dumps(fitted, sort_keys=True) if fitted else 'not fitted'}`"
    )
    lines.extend(["", "## Gates", "", "| Gate | Result | Detail |", "| --- | --- | --- |"])
    for item in payload.get("gates") or []:
        lines.append(
            f"| {item['name']} | {'PASS' if item['passed'] else 'FAIL'} | {item['detail']} |"
        )
    lines.extend(
        [
            "",
            "## Reconstruction Notes",
            "",
            "- nflverse play-by-play supplies event order, UTC wall-clock timestamps, game clocks, GSIS IDs, and offensive, kicking, defensive, and return attribution.",
            "- Sleeper supplies lineups, league scoring, authoritative final player points, and matchup outcomes.",
            "- BALLDONTLIE is not used. Sleeper plus nflverse are sufficient for this offline backtest.",
            "- Each starter's baseline projection uses only that season's outcomes from earlier weeks. Current scoring is compared with the elapsed share of that projection, so being ahead of or behind pace directly affects the remaining mean.",
            "- Snapshots are sampled every 15 minutes while at least one NFL game is active, plus kickoff and final transitions; idle overnight gaps are not repeated.",
            "- Earlier snapshots are never rescaled with final Sleeper totals. Final totals are used only for labels and reconciliation gates.",
            "- Model parameters are fitted only on 2023–2024. All 2025 metrics are holdout results.",
            f"- Unsupported nonzero scoring keys found: **{len(audit.unsupported_scoring_keys)}**.",
        ]
    )
    if audit.unsupported_scoring_keys:
        lines.append(
            "- Unsupported keys: "
            + ", ".join(f"`{key}`" for key in sorted(audit.unsupported_scoring_keys))
        )
    lines.append("")
    return "\n".join(lines)


def run(args: argparse.Namespace) -> Tuple[Dict[str, Any], ReconstructionAudit]:
    manifest = validate_manifest(args.manifest)
    args.cache_dir.mkdir(parents=True, exist_ok=True)
    players, contexts = load_sleeper_inputs(
        manifest,
        args.cache_dir,
        args.refresh,
        args.offline,
    )
    pbp_by_season = {
        season: load_pbp(season, path, args.cache_dir, args.refresh)
        for season, path in manifest["playByPlay"].items()
    }
    sleeper_to_entity, player_meta, _ = build_player_maps(players, pbp_by_season)
    dataset, audit = build_dataset(
        contexts,
        pbp_by_season,
        sleeper_to_entity,
        player_meta,
    )
    counts = aggregate_counts(contexts, dataset, audit)
    if not len(dataset["season"]):
        failure_gate = gate("reconstructedDataset", False, "No matchups survived reconstruction.")
        return (
            candidate_payload(
                "neutral-failed-closed",
                neutral_parameters(),
                None,
                [failure_gate],
                counts,
                None,
                None,
            ),
            audit,
        )
    train_mask = np.isin(dataset["season"], TRAINING_SEASONS)
    fitted = fit_parameters(dataset, train_mask)
    baseline_metrics = evaluate_model(dataset, neutral_parameters())
    fitted_metrics = evaluate_model(dataset, fitted)
    gates = evaluate_gates(dataset, audit, baseline_metrics, fitted_metrics)
    passed = all(item["passed"] for item in gates)
    selected = fitted if passed else neutral_parameters()
    status = "calibrated-candidate" if passed else "neutral-failed-closed"
    return (
        candidate_payload(
            status,
            selected,
            fitted,
            gates,
            counts,
            {key: metric_json(value) for key, value in baseline_metrics.items()},
            {key: metric_json(value) for key, value in fitted_metrics.items()},
        ),
        audit,
    )


def main() -> int:
    args = parse_args()
    audit = ReconstructionAudit()
    try:
        payload, audit = run(args)
    except Exception as error:
        payload = candidate_payload(
            "neutral-failed-closed",
            neutral_parameters(),
            None,
            [gate("pipelineCompleted", False, str(error))],
            {},
            None,
            None,
            failure=f"{type(error).__name__}: {error}",
        )
    write_json(args.candidate, payload)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(render_report(payload, audit))
    print(
        json.dumps(
            {
                "status": payload["status"],
                "failedGates": payload["failedGates"],
                "candidate": str(args.candidate),
                "report": str(args.report),
            },
            indent=2,
        )
    )
    return 0 if payload["status"] == "calibrated-candidate" else 2


if __name__ == "__main__":
    raise SystemExit(main())
