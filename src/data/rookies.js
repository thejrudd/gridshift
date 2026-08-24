import { applyCombineData } from './rookieCombine.js';
import { ROOKIE_PRODUCTION_2026 } from './rookieProduction.generated.js';
import { ESPN_BOARD_IDS } from './espnBoardIds.js';

const NFL_TRACKER = 'https://www.nfl.com/draft/tracker/2026/prospects/all_all';
const NFL_TOP_150 = 'https://www.nfl.com/news/daniel-jeremiah-s-top-150-prospects-in-the-2026-nfl-draft-class';
const NFL_DRAFT_ORDER = 'https://www.nfl.com/news/2026-nfl-draft-order-for-all-seven-rounds';
const PFF_BOARD = 'https://www.pff.com/news/draft-2026-nfl-draft-profiles';
const ESPN_REID_BOARD = 'https://www.espn.com/nfl/draft2026/story?id=47027232';
const NFLVERSE_DRAFT_PICKS = 'https://github.com/nflverse/nflverse-data/releases/download/draft_picks/draft_picks.csv';

const BASE_SOURCES = {
  prospects: NFL_TRACKER,
  rankings: NFL_TOP_150,
  draftOrder: NFL_DRAFT_ORDER,
};

function positionGroup(position) {
  const normalized = position.toUpperCase();
  if (['QB', 'RB', 'FB', 'WR', 'TE'].includes(normalized)) return normalized === 'FB' ? 'RB' : normalized;
  if (normalized.includes('EDGE') || ['DE', 'DT', 'NT'].includes(normalized)) return 'DL';
  if (['LB', 'OLB', 'ILB'].includes(normalized) || normalized.includes('LB')) return 'LB';
  if (['CB', 'SAF', 'S'].includes(normalized)) return 'DB';
  if (['OT', 'OG', 'G', 'C', 'IOL'].includes(normalized)) return 'OL';
  return 'ST';
}

function tierFromRank(rank) {
  if (rank <= 32) return 'Starter';
  if (rank <= 150) return 'Rotational';
  return 'Developmental';
}

function tierFromGrade(grade, rank) {
  if (!Number.isFinite(grade)) return tierFromRank(rank);
  if (grade >= 6.70) return 'Elite';
  if (grade >= 6.40) return 'Starter';
  if (grade >= 6.20) return 'Rotational';
  return 'Developmental';
}

function projectedPickBias(player) {
  const position = String(player.position || '').toUpperCase();
  const group = String(player.positionGroup || '').toUpperCase();

  if (position === 'QB') return -28;
  if (position === 'OT') return -10;
  if (['EDGE', 'DE'].includes(position)) return -8;
  if (position === 'DT') return -2;
  if (position === 'CB') return -4;
  if (group === 'WR') return -2;
  if (group === 'OL') return 4;
  if (group === 'DL') return 2;
  if (group === 'LB') return 8;
  if (['S', 'SAF'].includes(position) || group === 'DB') return 10;
  if (group === 'TE') return 8;
  if (group === 'RB') return 16;
  if (group === 'ST') return 28;
  return 0;
}

function projectProspects(players) {
  const ordered = [...players].sort((a, b) => {
    const aRank = Number.isFinite(a.bigBoardRank) ? a.bigBoardRank : 9999;
    const bRank = Number.isFinite(b.bigBoardRank) ? b.bigBoardRank : 9999;
    const aGradeBoost = Number.isFinite(a.nflGrade) ? (a.nflGrade - 6.3) * 12 : 0;
    const bGradeBoost = Number.isFinite(b.nflGrade) ? (b.nflGrade - 6.3) * 12 : 0;
    const aScore = aRank + projectedPickBias(a) - aGradeBoost;
    const bScore = bRank + projectedPickBias(b) - bGradeBoost;
    if (aScore !== bScore) return aScore - bScore;
    return aRank - bRank;
  });

  const projectedById = new Map(ordered.map((player, index) => [player.id, index + 1]));
  return players.map((player) => ({
    ...player,
    projectedOverall: projectedById.get(player.id) ?? null,
  }));
}

function rookie(rank, name, position, college, nflGrade, extra = {}) {
  const normalizedPosition = position.toUpperCase();

  return {
    id: `2026-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`,
    name,
    position: normalizedPosition,
    positionGroup: positionGroup(normalizedPosition),
    college,
    sleeperPlayerId: null,
    espnCollegeId: null,
    draftStatus: 'prospect',
    draftRound: null,
    draftPick: null,
    draftOverall: null,
    draftTeam: null,
    draftTeamName: null,
    projectedOverall: rank,
    bigBoardRank: rank,
    nflGrade,
    dynastyAdp: null,
    tier: tierFromGrade(nflGrade, rank),
    collegeStats: null,
    combine: {
      heightIn: null,
      weightLbs: null,
      fortyYard: null,
      vertical: null,
      broadJump: null,
      threeCone: null,
      shuttle: null,
      benchPress: null,
    },
    combinePercentiles: {
      fortyYard: null,
      vertical: null,
      broadJump: null,
      threeCone: null,
      shuttle: null,
      benchPress: null,
    },
    sources: BASE_SOURCES,
    ...extra,
  };
}

const RICH_ROOKIES_2026 = [
  rookie(1, 'Arvell Reese', 'EDGE', 'Ohio State', 7.04, {
    positionGroup: 'DL',
    espnCollegeId: '4950400',
    draftStatus: 'drafted',
    draftRound: 1,
    draftPick: 5,
    draftOverall: 5,
    draftTeam: 'nyg',
    draftTeamName: 'New York Giants',
    sources: { ...BASE_SOURCES, alternateBoard: PFF_BOARD },
  }),
  rookie(2, 'David Bailey', 'EDGE', 'Texas Tech', 6.78, {
    positionGroup: 'DL',
    espnCollegeId: '4685248',
    sources: { ...BASE_SOURCES, alternateBoard: PFF_BOARD },
  }),
  rookie(3, 'Mansoor Delane', 'CB', 'LSU', 6.77, {
    positionGroup: 'DB',
    espnCollegeId: '4880124',
    sources: { ...BASE_SOURCES, alternateBoard: PFF_BOARD },
  }),
  rookie(4, 'Fernando Mendoza', 'QB', 'Indiana', 6.73, {
    espnCollegeId: '4837248',
    draftStatus: 'drafted',
    draftRound: 1,
    draftPick: 1,
    draftOverall: 1,
    draftTeam: 'lv',
    draftTeamName: 'Las Vegas Raiders',
    collegeStats: {
      completions: null,
      attempts: null,
      passYards: null,
      passTDs: null,
      interceptions: null,
      carries: null,
      rushYards: null,
      rushTDs: null,
    },
    sources: { ...BASE_SOURCES, alternateBoard: PFF_BOARD },
  }),
  rookie(5, 'Jeremiyah Love', 'RB', 'Notre Dame', 6.73, {
    espnCollegeId: '4870808',
    collegeStats: {
      carries: null,
      rushYards: null,
      rushTDs: null,
      recTargets: null,
      receptions: null,
      recYards: null,
      recTDs: null,
    },
    sources: { ...BASE_SOURCES, alternateBoard: PFF_BOARD },
  }),
  rookie(6, 'Carnell Tate', 'WR', 'Ohio State', 6.71, {
    espnCollegeId: '4871023',
    collegeStats: {
      recTargets: null,
      receptions: null,
      recYards: null,
      recTDs: null,
    },
    sources: { ...BASE_SOURCES, alternateBoard: PFF_BOARD },
  }),
  rookie(7, 'Rueben Bain Jr.', 'EDGE', 'Miami', 6.70, {
    espnCollegeId: '4870617', positionGroup: 'DL' }),
  rookie(8, 'Francis Mauigoa', 'OT', 'Miami', 6.48, {
    positionGroup: 'OL',
    espnCollegeId: '4870914',
  }),
  rookie(9, 'Sonny Styles', 'LB', 'Ohio State', 6.48, {
    espnCollegeId: '5081807',
  }),
  rookie(10, 'Caleb Downs', 'SAF', 'Ohio State', 6.47, {
    espnCollegeId: '4870706', positionGroup: 'DB' }),
  rookie(11, 'Makai Lemon', 'WR', 'USC', 6.47, {
    espnCollegeId: '4870795',
    collegeStats: {
      recTargets: null,
      receptions: null,
      recYards: null,
      recTDs: null,
    },
  }),
  rookie(12, 'Kenyon Sadiq', 'TE', 'Oregon', 6.46, {
    espnCollegeId: '5083315',
    collegeStats: {
      recTargets: null,
      receptions: null,
      recYards: null,
      recTDs: null,
    },
    sources: { ...BASE_SOURCES, alternateBoard: PFF_BOARD },
  }),
  rookie(13, 'Kadyn Proctor', 'OT', 'Alabama', 6.45, {
    espnCollegeId: '4870976', positionGroup: 'OL' }),
  rookie(14, 'Spencer Fano', 'OT', 'Utah', 6.44, {
    espnCollegeId: '4870723', positionGroup: 'OL' }),
  rookie(15, 'Jordyn Tyson', 'WR', 'Arizona State', 6.43, {
    espnCollegeId: '4880281',
    collegeStats: {
      recTargets: null,
      receptions: null,
      recYards: null,
      recTDs: null,
    },
  }),
  rookie(16, 'Keldric Faulk', 'EDGE', 'Auburn', 6.43, {
    espnCollegeId: '4870707', positionGroup: 'DL' }),
  rookie(17, 'Akheem Mesidor', 'EDGE', 'Miami', 6.42, {
    espnCollegeId: '4429190', positionGroup: 'DL' }),
  rookie(18, 'KC Concepcion', 'WR', 'Texas A&M', 6.42, {
    espnCollegeId: '4870653',
    collegeStats: {
      recTargets: null,
      receptions: null,
      recYards: null,
      recTDs: null,
    },
  }),
  rookie(19, 'Olaivavega Ioane', 'G', 'Penn State', 6.41, {
    espnCollegeId: '4832793', positionGroup: 'OL' }),
  rookie(20, 'Denzel Boston', 'WR', 'Washington', 6.40, {
    espnCollegeId: '4832800',
    collegeStats: {
      recTargets: null,
      receptions: null,
      recYards: null,
      recTDs: null,
    },
  }),
  rookie(21, 'Jermod McCoy', 'CB', 'Tennessee', 6.40, {
    espnCollegeId: '5157289', positionGroup: 'DB' }),
  rookie(22, 'Zion Young', 'EDGE', 'Missouri', 6.40, {
    espnCollegeId: '4839501', positionGroup: 'DL' }),
  rookie(23, 'Anthony Hill Jr.', 'LB', 'Texas', 6.39, {
    espnCollegeId: '4870805',
  }),
  rookie(24, 'Avieon Terrell', 'CB', 'Clemson', 6.39, {
    espnCollegeId: '4870988', positionGroup: 'DB' }),
  rookie(25, 'Emmanuel McNeil-Warren', 'SAF', 'Toledo', 6.39, {
    espnCollegeId: '4837186', positionGroup: 'DB' }),
  rookie(26, 'Kayden McDonald', 'DT', 'Ohio State', 6.39, {
    espnCollegeId: '4870893', positionGroup: 'DL' }),
  rookie(27, 'Omar Cooper Jr.', 'WR', 'Indiana', 6.39, {
    espnCollegeId: '4723820',
    collegeStats: {
      recTargets: null,
      receptions: null,
      recYards: null,
      recTDs: null,
    },
  }),
  rookie(28, 'Caleb Lomu', 'OT', 'Utah', 6.38, {
    espnCollegeId: '4921438', positionGroup: 'OL' }),
  rookie(29, 'Cashius Howell', 'EDGE', 'Texas A&M', 6.38, {
    espnCollegeId: '4710752', positionGroup: 'DL' }),
  rookie(30, 'Colton Hood', 'CB', 'Tennessee', 6.38, {
    espnCollegeId: '4921249', positionGroup: 'DB' }),
  rookie(31, 'Jadarian Price', 'RB', 'Notre Dame', 6.38, {
    espnCollegeId: '4685512',
    collegeStats: {
      carries: null,
      rushYards: null,
      rushTDs: null,
      recTargets: null,
      receptions: null,
      recYards: null,
      recTDs: null,
    },
  }),
  rookie(32, 'Monroe Freeling', 'OT', 'Georgia', 6.38, {
    espnCollegeId: '4870694', positionGroup: 'OL' }),
  rookie(33, 'Caleb Banks', 'DT', 'Florida', 6.37, {
    espnCollegeId: '4602019', positionGroup: 'DL' }),
  rookie(34, 'Dillon Thieneman', 'SAF', 'Oregon', 6.37, {
    espnCollegeId: '4954445', positionGroup: 'DB' }),
  rookie(35, 'Chris Brazzell II', 'WR', 'Tennessee', 6.36, {
    espnCollegeId: '5091739',
    collegeStats: {
      recTargets: null,
      receptions: null,
      recYards: null,
      recTDs: null,
    },
  }),
  rookie(36, 'Emmanuel Pregnon', 'G', 'Oregon', 6.36, {
    espnCollegeId: '4608929', positionGroup: 'OL' }),
  rookie(37, 'Peter Woods', 'DT', 'Clemson', 6.36, {
    espnCollegeId: '4871063', positionGroup: 'DL' }),
  rookie(38, 'Chris Johnson', 'CB', 'San Diego State', 6.35, {
    espnCollegeId: '4869579', positionGroup: 'DB' }),
  rookie(39, 'Max Iheanachor', 'OT', 'Arizona State', 6.35, {
    espnCollegeId: '5150136', positionGroup: 'OL' }),
  rookie(40, 'Chase Bisontis', 'G', 'Texas A&M', 6.34, {
    espnCollegeId: '4870596', positionGroup: 'OL' }),
  rookie(41, 'Christen Miller', 'DT', 'Georgia', 6.34, {
    espnCollegeId: '4685479', positionGroup: 'DL' }),
  rookie(42, 'Jacob Rodriguez', 'LB', 'Texas Tech', 6.34, {
    espnCollegeId: '4566094',
  }),
  rookie(43, 'Malachi Lawrence', 'EDGE', 'UCF', 6.34, {
    espnCollegeId: '4710067', positionGroup: 'DL' }),
  rookie(44, 'Blake Miller', 'OT', 'Clemson', 6.33, {
    espnCollegeId: '5081450', positionGroup: 'OL' }),
  rookie(45, 'Gabe Jacas', 'EDGE', 'Illinois', 6.33, {
    espnCollegeId: '4837244', positionGroup: 'DL' }),
  rookie(46, 'Jake Golday', 'LB', 'Cincinnati', 6.33, {
    espnCollegeId: '4877652',
  }),
  rookie(47, 'Jalon Kilgore', 'SAF', 'South Carolina', 6.32, {
    espnCollegeId: '5076951', positionGroup: 'DB' }),
  rookie(48, 'Zachariah Branch', 'WR', 'Georgia', 6.32, {
    espnCollegeId: '4870612',
    collegeStats: {
      recTargets: null,
      receptions: null,
      recYards: null,
      recTDs: null,
    },
  }),
  rookie(49, 'Skyler Bell', 'WR', 'Connecticut', 6.31, {
    espnCollegeId: '4683153',
    collegeStats: {
      recTargets: null,
      receptions: null,
      recYards: null,
      recTDs: null,
    },
  }),
  rookie(50, 'Derrick Moore', 'EDGE', 'Michigan', 6.30, {
    espnCollegeId: '4685461', positionGroup: 'DL' }),
];

const ESPN_TOP_499_BOARD = `
1|Jeremiyah Love|RB|Notre Dame
2|Caleb Downs|S|Ohio State
3|Sonny Styles|LB|Ohio State
4|Arvell Reese|EDGE|Ohio State
5|Francis Mauigoa|OT|Miami
6|Fernando Mendoza|QB|Indiana
7|Rueben Bain Jr.|EDGE|Miami
8|Mansoor Delane|CB|LSU
9|David Bailey|EDGE|Texas Tech
10|Carnell Tate|WR|Ohio State
11|Olaivavega Ioane|G|Penn State
12|Jermod McCoy|CB|Tennessee
13|Makai Lemon|WR|USC
14|Monroe Freeling|OT|Georgia
15|Jordyn Tyson|WR|Arizona State
16|Kenyon Sadiq|TE|Oregon
17|Dillon Thieneman|S|Oregon
18|Spencer Fano|OT|Utah
19|Chris Johnson|CB|San Diego State
20|Keldric Faulk|EDGE|Auburn
21|Omar Cooper Jr.|WR|Indiana
22|Colton Hood|CB|Tennessee
23|KC Concepcion|WR|Texas A&M
24|Max Iheanachor|OT|Arizona State
25|Emmanuel McNeil-Warren|S|Toledo
26|Blake Miller|OT|Clemson
27|D'Angelo Ponds|CB|Indiana
28|T.J. Parker|EDGE|Clemson
29|Avieon Terrell|CB|Clemson
30|Caleb Lomu|OT|Utah
31|Gabe Jacas|EDGE|Illinois
32|Denzel Boston|WR|Washington
33|Akheem Mesidor|EDGE|Miami
34|Kadyn Proctor|OT|Alabama
35|Peter Woods|DT|Clemson
36|Cashius Howell|EDGE|Texas A&M
37|Kayden McDonald|DT|Ohio State
38|Jacob Rodriguez|LB|Texas Tech
39|Brandon Cisse|CB|South Carolina
40|Chase Bisontis|G|Texas A&M
41|Zion Young|EDGE|Missouri
42|Germie Bernard|WR|Alabama
43|CJ Allen|LB|Georgia
44|Malachi Lawrence|EDGE|UCF
45|Emmanuel Pregnon|G|Oregon
46|Caleb Banks|DT|Florida
47|Josiah Trotter|LB|Missouri
48|Keylan Rutledge|G|Georgia Tech
49|Jake Golday|LB|Cincinnati
50|Ty Simpson|QB|Alabama
51|A.J. Haulcy|S|LSU
52|Lee Hunter|DT|Texas Tech
53|Jadarian Price|RB|Notre Dame
54|Antonio Williams|WR|Clemson
55|R Mason Thomas|EDGE|Oklahoma
56|Anthony Hill Jr.|LB|Texas
57|Eli Stowers|TE|Vanderbilt
58|Christen Miller|DT|Georgia
59|Keionte Scott|CB|Miami
60|Chris Bell|WR|Louisville
61|Derrick Moore|EDGE|Michigan
62|Jalen Farmer|G|Kentucky
63|Gracen Halton|DT|Oklahoma
64|Treydan Stukes|S|Arizona
65|Skyler Bell|WR|UConn
66|Keith Abney II|CB|Arizona State
67|Logan Jones|C|Iowa
68|Oscar Delp|TE|Georgia
69|Connor Lew|C|Auburn
70|Mike Washington Jr.|RB|Arkansas
71|Kaleb Proctor|DT|SE Louisiana
72|Kyle Louis|S|Pittsburgh
73|Jaishawn Barham|EDGE|Michigan
74|Daylen Everette|CB|Georgia
75|Ted Hurst|WR|Georgia State
76|Kamari Ramsey|S|USC
77|Gennings Dunker|G|Iowa
78|Joshua Josephs|EDGE|Tennessee
79|Zakee Wheatley|S|Penn State
80|Max Klare|TE|Ohio State
81|Ja'Kobi Lane|WR|USC
82|Sam Hecht|C|Kansas State
83|Caleb Tiernan|OT|Northwestern
84|Zachariah Branch|WR|Georgia
85|Dani Dennis-Sutton|EDGE|Penn State
86|Malik Muhammad|CB|Texas
87|Bryce Lance|WR|North Dakota State
88|Keyron Crawford|EDGE|Auburn
89|Davison Igbinosun|CB|Ohio State
90|Jake Slaughter|C|Florida
91|Chris Brazzell II|WR|Tennessee
92|Genesis Smith|S|Arizona
93|De'Zhaun Stribling|WR|Ole Miss
94|Sam Roush|TE|Stanford
95|Malachi Fields|WR|Notre Dame
96|Garrett Nussmeier|QB|LSU
97|Jalon Kilgore|S|South Carolina
98|Jonah Coleman|RB|Washington
99|Bud Clark|S|TCU
100|Domonique Orange|DT|Iowa State
101|Trey Zuhn III|C|Texas A&M
102|Chandler Rivers|CB|Duke
103|Deion Burks|WR|Oklahoma
104|Justin Joly|TE|NC State
105|Will Lee III|CB|Texas A&M
106|Markel Bell|OT|Miami
107|Jeremiah Wright|G|Auburn
108|Romello Height|EDGE|Texas Tech
109|Emmett Johnson|RB|Nebraska
110|Darrell Jackson Jr.|DT|Florida State
111|Brenen Thompson|WR|Mississippi State
112|Tyler Onyedim|DT|Texas A&M
113|Travis Burke|OT|Memphis
114|Carson Beck|QB|Miami
115|Elijah Sarratt|WR|Indiana
116|Brian Parker II|C|Duke
117|Jude Bowry|OT|Boston College
118|Zane Durant|DT|Penn State
119|Febechi Nwaiwu|G|Oklahoma
120|Chris McClellan|DT|Missouri
121|Mason Reiger|EDGE|Wisconsin
122|Rayshaun Benny|DT|Michigan
123|Kendrick Law|WR|Kentucky
124|Eli Raridon|TE|Notre Dame
125|Julian Neal|CB|Arkansas
126|Cole Payton|QB|North Dakota State
127|Austin Barber|OT|Florida
128|Billy Schrauth|G|Notre Dame
129|Keyshaun Elliott|LB|Arizona State
130|Demond Claiborne|RB|Wake Forest
131|Malik Benson|WR|Oregon
132|Will Kacmarek|TE|Ohio State
133|Charles Demmings|CB|Stephen F. Austin
134|VJ Payne|S|Kansas State
135|Matt Gulbin|C|Michigan State
136|Hezekiah Masses|CB|California
137|Drew Allar|QB|Penn State
138|Jakobe Thomas|S|Miami
139|Kage Casey|G|Boise State
140|Adam Randall|RB|Clemson
141|Josh Cameron|WR|Baylor
142|Kaleb Elarms-Orr|LB|TCU
143|Jack Endries|TE|Texas
144|Harold Perkins Jr.|LB|LSU
145|Kaytron Allen|RB|Penn State
146|DeMonte Capehart|DT|Clemson
147|Keagen Trost|G|Missouri
148|Nate Boerkircher|TE|Texas A&M
149|George Gumbs Jr.|EDGE|Florida
150|Aiden Fisher|LB|Indiana
151|Nicholas Singleton|RB|Penn State
152|Dametrious Crownover|OT|Texas A&M
153|Tacario Davis|CB|Washington
154|Devin Moore|CB|Florida
155|Jadon Canady|CB|Oregon
156|Taylen Green|QB|Arkansas
157|LT Overton|EDGE|Alabama
158|Bryce Boettcher|LB|Oregon
159|Joe Royer|TE|Cincinnati
160|Ephesians Prysock|CB|Washington
161|Nick Barrett|DT|South Carolina
162|Jimmy Rolder|LB|Michigan
163|Dallen Bentley|TE|Utah
164|Max Llewellyn|EDGE|Iowa
165|Micah Morris|G|Georgia
166|Avery Smith|CB|Toledo
167|Anez Cooper|G|Miami
168|Red Murdock|LB|Buffalo
169|Albert Regis|DT|Texas A&M
170|Nadame Tucker|EDGE|Western Michigan
171|J.C. Davis|OT|Illinois
172|Ar'maj Reed-Adams|G|Texas A&M
173|Jaden Dugger|LB|Louisiana
174|Cyrus Allen|WR|Cincinnati
175|Caden Curry|EDGE|Ohio State
176|Enrique Cruz Jr.|G|Kansas
177|Kaelon Black|RB|Indiana
178|Tim Keenan III|DT|Alabama
179|Devon Marshall|CB|NC State
180|Justin Jefferson|LB|Alabama
181|J'Mari Taylor|RB|Virginia
182|Diego Pounds|OT|Ole Miss
183|Ahmari Harvey|CB|Georgia Tech
184|Reggie Virgil|WR|Texas Tech
185|Michael Taaffe|S|Texas
186|Marlin Klein|TE|Michigan
187|Pat Coogan|C|Indiana
188|Deontae Lawson|LB|Alabama
189|Riley Nowakowski|TE|Indiana
190|Skyler Gill-Howard|DT|Texas Tech
191|Colbie Young|WR|Georgia
192|Kevin Coleman Jr.|WR|Missouri
193|Drew Shelton|OT|Penn State
194|Latrell McCutchin Sr.|CB|Houston
195|Beau Stephens|G|Iowa
196|Jalen Huskey|S|Maryland
197|Josh Cuevas|TE|Alabama
198|Anthony Lucas|EDGE|USC
199|Seth McGowan|RB|Kentucky
200|Tanner Koziol|TE|Houston
201|Nolan Rucci|OT|Penn State
202|Jack Kelly|LB|BYU
203|CJ Daniels|WR|Miami
204|Trey Moore|EDGE|Texas
205|Jeff Caldwell|WR|Cincinnati
206|Carver Willis|G|Washington
207|Kaden Wetjen|WR|Iowa
208|Logan Taylor|G|Boston College
209|DJ Campbell|G|Texas
210|Alan Herron|OT|Maryland
211|Barion Brown|WR|LSU
212|Eli Heidenreich|RB|Navy
213|Dae'Quan Wright|TE|Ole Miss
214|Jager Burton|C|Kentucky
215|Caleb Douglas|WR|Texas Tech
216|Cade Klubnik|QB|Clemson
217|Cole Wisniewski|S|Texas Tech
218|Parker Brailsford|C|Alabama
219|Isaiah World|OT|Oregon
220|Caden Barnett|C|Wyoming
221|Taurean York|LB|Texas A&M
222|TJ Hall|CB|Iowa
223|Thaddeus Dixon|CB|North Carolina
224|Aaron Graves|EDGE|Iowa
225|Andre Fuller|CB|Toledo
226|Alex Harkey|G|Oregon
227|Collin Wright|CB|Stanford
228|Fernando Carmona|G|Arkansas
229|Vinny Anthony II|WR|Wisconsin
230|Mikail Kamara|EDGE|Indiana
231|Evan Beerntsen|G|Northwestern
232|Kendal Daniels|LB|Oklahoma
233|Ceyair Wright|CB|Nebraska
234|Bryson Eason|DT|Tennessee
235|David Gusta|DT|Kentucky
236|Jaylon Guilbeau|CB|Texas
237|Cian Slone|EDGE|NC State
238|Michael Trigg|TE|Baylor
239|Chris Hilton Jr.|WR|LSU
240|Aaron Hall|DT|Duke
241|Luke Altmyer|QB|Illinois
242|Fa'alili Fa'amoe|OT|Wake Forest
243|Roman Hemby|RB|Indiana
244|DeShon Singleton|S|Nebraska
245|Lance Mason|TE|Wisconsin
246|Zavion Thomas|WR|LSU
247|James Brockermeyer|C|Miami
248|Wesley Williams|EDGE|Duke
249|Gary Smith III|DT|UCLA
250|Jack Pyburn|EDGE|LSU
251|Harrison Wallace III|WR|Ole Miss
252|Chip Trayanum|RB|Toledo
253|Xavian Sorey Jr.|LB|Arkansas
254|Robert Spears-Jennings|S|Oklahoma
255|J. Michael Sturdivant|WR|Florida
256|Caullin Lacy|WR|Louisville
257|Garrett DiGiorgio|G|UCLA
258|Landon Robinson|DT|Navy
259|Lorenzo Styles Jr.|S|Ohio State
260|Davon Booth|RB|Mississippi State
261|Dillon Bell|WR|Georgia
262|John Michael Gyllenborg|TE|Wyoming
263|Deven Eastern|DT|Minnesota
264|Toriano Pride Jr.|CB|Missouri
265|Jam Miller|RB|Alabama
266|Trey Smack|K|Florida
267|Seydou Traore|TE|Mississippi State
268|Jordan van den Berg|DT|Georgia Tech
269|Daniel Sobkowicz|WR|Illinois State
270|Jaydn Ott|RB|Oklahoma
271|Miles Kitselman|TE|Tennessee
272|West Weeks|LB|LSU
273|Cameron Ball|DT|Arkansas
274|Lake McRee|TE|USC
275|Eric Gentry|LB|USC
276|Robert Henry Jr.|RB|UTSA
277|Jaren Kanak|TE|Oklahoma
278|Cole Brevard|DT|Texas
279|Dillon Wade|G|Auburn
280|Logan Fano|LB|Utah
281|Brandon Cleveland|DT|NC State
282|Domani Jackson|CB|Alabama
283|Dontay Corleone|DT|Cincinnati
284|Max Bredeson|TE|Michigan
285|Rene Konga|DT|Louisville
286|Tyreak Sapp|EDGE|Florida
287|Nick Dawkins|C|Penn State
288|Jackson Kuwatch|LB|Miami (Ohio)
289|Dalton Johnson|S|Arizona
290|Connor Tollison|C|Missouri
291|Tyren Montgomery|WR|John Carroll
292|Tristan Leigh|OT|Clemson
293|Lander Barton|LB|Utah
294|Lewis Bond|WR|Boston College
295|Ryan Eckley|P|Michigan State
296|Quintayvious Hutchins|EDGE|Boston College
297|Louis Moore|S|Indiana
298|Wade Woodaz|LB|Clemson
299|Chase Roberts|WR|BYU
300|Caleb Offord|CB|Kennesaw State
301|Jeffrey M'ba|DT|SMU
302|Jordan Hudson|WR|SMU
303|Scooby Williams|LB|Texas A&M
304|Xavier Nwankpa|S|Iowa
305|Bobby Jamison-Travis|DT|Auburn
306|Marcus Allen|CB|North Carolina
307|Jack Walsh|C|Wyoming
308|Jalen Walthall|WR|Incarnate Word
309|Dominic Zvada|K|Michigan
310|DeVonta Smith|CB|Notre Dame
311|Delby Lemieux|C|Dartmouth
312|Aaron Anderson|WR|LSU
313|Wesley Bissainthe|LB|Miami
314|Jaeden Roberts|G|Alabama
315|Matthew Hibner|TE|SMU
316|Skyler Thomas|S|Oregon State
317|Damonic Williams|DT|Oklahoma
318|Namdi Obiazor|LB|TCU
319|Jalon Daniels|QB|Kansas
320|Rahsul Faison|RB|South Carolina
321|RJ Maryland|TE|SMU
322|Aamil Wagner|OT|Notre Dame
323|Sawyer Robertson|QB|Baylor
324|Nyjalik Kelly|EDGE|UCF
325|David Blay Jr.|DT|Miami
326|Brett Thorson|P|Georgia
327|Miles Scott|S|Illinois
328|Romello Brinson|WR|SMU
329|Erick Hunter|LB|Morgan State
330|Dane Key|WR|Nebraska
331|Micah Pettus|OT|Florida State
332|Vincent Anthony Jr.|EDGE|Duke
333|Noah Whittington|RB|Oregon
334|Jack Strand|QB|Minnesota St. Moorhead
335|Josh Thompson|G|LSU
336|Tyre West|DT|Tennessee
337|Carsen Ryan|TE|BYU
338|DJ Rogers|TE|TCU
339|Zxavian Harris|DT|Ole Miss
340|Jayden Williams|OT|Ole Miss
341|Eric Rivers|WR|Georgia Tech
342|Karon Prunty|CB|Wake Forest
343|CJ Donaldson|RB|Ohio State
344|Jeadyn Lukus|S|Clemson
345|Fred Davis II|CB|Northwestern
346|James Thompson Jr.|DT|Illinois
347|Joe Fagnano|QB|UConn
348|Ernest Hausmann|LB|Michigan
349|Austin Brown|S|Wisconsin
350|Desmond Reid|RB|Pittsburgh
351|Haynes King|QB|Georgia Tech
352|Michael Wortham|WR|Montana
353|Marvin Jones Jr.|EDGE|Oklahoma
354|Tommy Doman|P|Florida
355|Karson Sharar|LB|Iowa
356|Diego Pavia|QB|Vanderbilt
357|Drew Stevens|K|Iowa
358|Aidan Hubbard|EDGE|Northwestern
359|Ahmaad Moses|S|SMU
360|Patrick Payton|EDGE|LSU
361|Mark Gronowski|QB|Iowa
362|Dean Connors|RB|Houston
363|Malcom DeWalt IV|CB|Akron
364|Jack Stonehouse|P|Syracuse
365|Jalen Stroman|S|Notre Dame
366|Tyler Duzansky|LS|Penn State
367|Uar Bernard|DT|Nigeria/IPP
368|Maximus Pulley|S|Wofford
369|Jackson Carsello|C|Northwestern
370|A.J. Pena|EDGE|Rhode Island
371|Beau Gardner|LS|Georgia
372|Eric McAlister|WR|TCU
373|Emmanuel Henderson Jr.|WR|Kansas
374|Riley Mahlman|OT|Wisconsin
375|Stephen Daley|DT|Indiana
376|Shad Banks Jr.|LB|UTSA
377|Mitchell Melton|EDGE|Virginia
378|Dan Villari|TE|Syracuse
379|Devonte Ross|WR|Penn State
380|Luke Petitbon|C|Florida State
381|Brent Austin|CB|California
382|Jordan White|C|Vanderbilt
383|Derek Robertson|QB|Monmouth
384|Donavon Greene|WR|Virginia Tech
385|Khalil Dinkins|TE|Penn State
386|Alex Wollschlaeger|OT|Kentucky
387|Bryce Foster|C|Kansas
388|Joshua Weru|EDGE|Kenya/IPP
389|James Neal III|OT|Iowa State
390|Bryan Thomas Jr.|EDGE|South Carolina
391|Bauer Sharp|TE|LSU
392|Keyshawn James-Newby|EDGE|New Mexico
393|Gavin Ortega|C|Weber State
394|Kobe Prentice|WR|Baylor
395|Hayden Large|TE|Iowa
396|Khordae Sydnor|EDGE|Vanderbilt
397|Ryan Mosesso|C|UMass
398|Kapena Gushiken|S|Ole Miss
399|Isaiah Jatta|OT|BYU
400|Jack Velling|TE|Michigan State
401|Athan Kaliakmanis|QB|Rutgers
402|Joshua Braun|G|Kentucky
403|Michael Heldman|EDGE|Central Michigan
404|Rohan Jones|TE|Arkansas
405|TJ Burke|DT|Lehigh
406|Jackie Marshall|DT|Baylor
407|Liam Brown|G|Montana
408|Kejon Owens|RB|Florida International
409|Langston Jones|G|Lehigh
410|Josh Gesky|G|Illinois
411|Truman Werremeyer|FB|North Dakota State
412|Will Pauling|WR|Notre Dame
413|Henry Lutovsky|G|Nebraska
414|Tanoa Togiai|G|Utah
415|Jayden Loving|DT|Wake Forest
416|Eni Falayi|TE|Wake Forest
417|Anterio Thompson|DT|Washington
418|Donaven McCulley|WR|Michigan
419|Maverick McIvor|QB|Western Kentucky
420|Joey Aguilar|QB|Tennessee
421|Ethan Onianwa|G|Ohio State
422|Chris Adams|G|Memphis
423|Barika Kpeenu|RB|North Dakota State
424|Max Tomczak|WR|Youngstown State
425|Sam Hagen|G|South Dakota State
426|Star Thomas|RB|Tennessee
427|Tyreek Chappell|CB|Texas A&M
428|Jamal Haynes|RB|Georgia Tech
429|Christian Jones|OT|San Diego State
430|Nikhai Hill-Green|LB|Alabama
431|Zach Durfee|EDGE|Washington
432|Jordon Simmons|RB|Georgia State
433|Kobe Baynes|G|Kentucky
434|Tomas Rimac|G|Virginia Tech
435|Dariel Djabome|LB|Rutgers
436|DT Sheffield|WR|Rutgers
437|Jacob Thomas|S|James Madison
438|Will Ferrin|K|BYU
439|Jalen McMurray|CB|Tennessee
440|Cash Jones|RB|Georgia
441|Miller Moss|QB|Louisville
442|Nick DeGennaro|WR|James Madison
443|Kentrel Bullock|RB|South Alabama
444|Dasan McCullough|EDGE|Nebraska
445|E.J. Williams Jr.|WR|Indiana
446|Declan Williams|LB|Incarnate Word
447|Jeff Yurk|P|Elon
448|Joe Cooper|G|Slippery Rock
449|Al-Jay Henderson|RB|Buffalo
450|Malik Rutherford|WR|Georgia Tech
451|Khalil Jacobs|LB|Missouri
452|Coleman Bennett|RB|Kennesaw State
453|TJ Guy|EDGE|Michigan
454|Larry Worth III|S|Arkansas
455|Walker Parks|G|Clemson
456|Garrison Grimes|LS|BYU
457|Anthony Hankerson|RB|Oregon State
458|Wydett Williams Jr.|S|Ole Miss
459|Anthony Smith|WR|East Carolina
460|Kyle Dixon|WR|Culver-Stockton
461|Ethan Burke|EDGE|Texas
462|Kolbey Taylor|CB|Vanderbilt
463|Behren Morton|QB|Texas Tech
464|Terion Stewart|RB|Virginia Tech
465|Trebor Pena|WR|Penn State
466|DQ Smith|S|South Carolina
467|Jack Dingle|LB|Cincinnati
468|Omari Evans|WR|Washington
469|Michael Coats Jr.|CB|West Virginia
470|Malik McClain|WR|Arizona State
471|Myles Rowser|S|Arizona State
472|Mory Bamba|CB|BYU
473|Kansei Matsuzawa|K|Hawaii
474|Hank Beatty|WR|Illinois
475|Jaren Kump|C|Utah
476|Ayden Garnes|CB|Arizona
477|Devan Boykin|S|Indiana
478|Mante Morrow|WR|Upper Iowa
479|Temi Ajirotutu|G|Villanova
480|Jarod Washington|WR|South Carolina State
481|Evan Svoboda|TE|Wyoming
482|Jaden Nixon|RB|UCF
483|Jordan Crook|LB|Arizona State
484|Cole Maynard|P|Western Kentucky
485|Devin Mockobee|RB|Purdue
486|Quincy Ivory|EDGE|Jackson State
487|Al'zillion Hamilton|CB|Fresno State
488|Luke Basso|LS|Oregon
489|Kevon King|RB|Norfolk State
490|Jordan Smith|WR|South Carolina State
491|Devin Voisin|WR|South Alabama
492|Jalen Jones|CB|William & Mary
493|Kyron Drones|QB|Virginia Tech
494|Clay Patterson|DT|Stanford
495|Bruno Onwuazor|OT|Virginia State
496|Kolbe Katsis|WR|Northern Arizona
497|Malik Spencer|S|Michigan State
498|Caden Fordham|LB|NC State
499|Shiyazh Pete|OT|Kentucky
`;

const ESPN_ROOKIES_2026 = ESPN_TOP_499_BOARD.trim().split('\n').map((line) => {
  const [rank, name, position, college] = line.split('|');
  const espnCollegeId = ESPN_BOARD_IDS[name] ?? null;
  return rookie(Number(rank), name, position, college, null, {
    sources: { ...BASE_SOURCES, fullBoard: ESPN_REID_BOARD },
    ...(espnCollegeId ? { espnCollegeId } : {}),
  });
});

const EXTRA_COMBINE_INVITEES_2026 = [
  rookie(500, "Le'Veon Moss", 'RB', 'Texas A&M', null, {
    sources: { ...BASE_SOURCES, combineInviteOnly: true },
  }),
  rookie(501, 'Owen Heinecke', 'LB', 'Oklahoma', null, {
    sources: { ...BASE_SOURCES, combineInviteOnly: true },
  }),
  rookie(502, 'Bishop Fitzgerald', 'SAF', 'USC', null, {
    positionGroup: 'DB',
    sources: { ...BASE_SOURCES, combineInviteOnly: true },
  }),
];

const EXTRA_DRAFTED_PLAYERS_2026 = [
  rookie(503, 'CJ Williams', 'WR', 'Stanford', null, {
    sources: { ...BASE_SOURCES, draftedOnly: NFLVERSE_DRAFT_PICKS },
  }),
  rookie(504, 'Gabriel Rubio', 'DL', 'Notre Dame', null, {
    sources: { ...BASE_SOURCES, draftedOnly: NFLVERSE_DRAFT_PICKS },
  }),
  rookie(505, 'Gavin Gerhardt', 'OL', 'Cincinnati', null, {
    sources: { ...BASE_SOURCES, draftedOnly: NFLVERSE_DRAFT_PICKS },
  }),
  rookie(506, 'Parker Hughes', 'LB', 'Middle Tenn. St.', null, {
    sources: { ...BASE_SOURCES, draftedOnly: NFLVERSE_DRAFT_PICKS },
  }),
  rookie(507, 'Michael Dansby', 'DB', 'Arizona', null, {
    sources: { ...BASE_SOURCES, draftedOnly: NFLVERSE_DRAFT_PICKS },
  }),
];

function prospectKey(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function mergeProspects(primary, fallback) {
  const fallbackByKey = new Map(fallback.map((player) => [prospectKey(player.name), player]));
  const mergedPrimary = primary.map((player) => {
    const broadBoardMatch = fallbackByKey.get(prospectKey(player.name));
    if (!broadBoardMatch) return player;

    return {
      ...player,
      bigBoardRank: broadBoardMatch.bigBoardRank,
      tier: tierFromGrade(player.nflGrade, broadBoardMatch.bigBoardRank),
      sources: {
        ...broadBoardMatch.sources,
        ...player.sources,
        fullBoard: ESPN_REID_BOARD,
      },
    };
  });
  const seen = new Set(mergedPrimary.map((player) => prospectKey(player.name)));
  return [
    ...mergedPrimary,
    ...fallback.filter((player) => {
      const key = prospectKey(player.name);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  ].sort((a, b) => a.bigBoardRank - b.bigBoardRank);
}

function mergeCollegeStats(curatedStats, generatedStats) {
  if (!generatedStats) return curatedStats;
  const stats = { ...(curatedStats ?? {}) };

  for (const [key, value] of Object.entries(generatedStats)) {
    if (value != null && stats[key] == null) {
      stats[key] = value;
    }
  }

  return Object.keys(stats).length ? stats : null;
}

function applyProductionData(players, productionById) {
  return players.map((player) => {
    const production = productionById[player.id];
    if (!production?.collegeStats) return player;

    return {
      ...player,
      collegeStats: mergeCollegeStats(player.collegeStats, production.collegeStats),
      sources: {
        ...player.sources,
        ...(production.source ? { collegeProduction: production.source } : null),
      },
    };
  });
}

export const ROOKIES_2026 = applyCombineData(
  applyProductionData(
    projectProspects(
      mergeProspects(RICH_ROOKIES_2026, [
        ...ESPN_ROOKIES_2026,
        ...EXTRA_COMBINE_INVITEES_2026,
        ...EXTRA_DRAFTED_PLAYERS_2026,
      ]),
    ),
    ROOKIE_PRODUCTION_2026,
  ),
);
