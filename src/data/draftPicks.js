const NFL_DRAFT_ORDER = 'https://www.nfl.com/news/2026-nfl-draft-order-for-all-seven-rounds';

const RAW_DRAFT_ORDER_2026 = `
1|1|Las Vegas Raiders
1|2|New York Jets
1|3|Arizona Cardinals
1|4|Tennessee Titans
1|5|New York Giants
1|6|Cleveland Browns
1|7|Washington Commanders
1|8|New Orleans Saints
1|9|Kansas City Chiefs
1|10|New York Giants|from Bengals
1|11|Miami Dolphins
1|12|Dallas Cowboys
1|13|Los Angeles Rams|from Falcons
1|14|Baltimore Ravens
1|15|Tampa Bay Buccaneers
1|16|New York Jets|from Colts
1|17|Detroit Lions
1|18|Minnesota Vikings
1|19|Carolina Panthers
1|20|Dallas Cowboys|from Packers
1|21|Pittsburgh Steelers
1|22|Los Angeles Chargers
1|23|Philadelphia Eagles
1|24|Cleveland Browns|from Jaguars
1|25|Chicago Bears
1|26|Buffalo Bills
1|27|San Francisco 49ers
1|28|Houston Texans
1|29|Kansas City Chiefs|from Rams
1|30|Miami Dolphins|from Broncos
1|31|New England Patriots
1|32|Seattle Seahawks
2|33|New York Jets
2|34|Arizona Cardinals
2|35|Tennessee Titans
2|36|Las Vegas Raiders
2|37|New York Giants
2|38|Houston Texans|from Commanders
2|39|Cleveland Browns
2|40|Kansas City Chiefs
2|41|Cincinnati Bengals
2|42|New Orleans Saints
2|43|Miami Dolphins
2|44|New York Jets|from Cowboys
2|45|Baltimore Ravens
2|46|Tampa Bay Buccaneers
2|47|Indianapolis Colts
2|48|Atlanta Falcons
2|49|Minnesota Vikings
2|50|Detroit Lions
2|51|Carolina Panthers
2|52|Green Bay Packers
2|53|Pittsburgh Steelers
2|54|Philadelphia Eagles
2|55|Los Angeles Chargers
2|56|Jacksonville Jaguars
2|57|Chicago Bears
2|58|San Francisco 49ers
2|59|Houston Texans
2|60|Chicago Bears|from Bills
2|61|Los Angeles Rams
2|62|Denver Broncos
2|63|New England Patriots
2|64|Seattle Seahawks
3|65|Arizona Cardinals
3|66|Tennessee Titans
3|67|Las Vegas Raiders
3|68|Philadelphia Eagles|from Jets
3|69|Houston Texans|from Giants
3|70|Cleveland Browns
3|71|Washington Commanders
3|72|Cincinnati Bengals
3|73|New Orleans Saints
3|74|Kansas City Chiefs
3|75|Miami Dolphins
3|76|Pittsburgh Steelers|from Cowboys
3|77|Tampa Bay Buccaneers
3|78|Indianapolis Colts
3|79|Atlanta Falcons
3|80|Baltimore Ravens
3|81|Jacksonville Jaguars|from Lions
3|82|Minnesota Vikings
3|83|Carolina Panthers
3|84|Green Bay Packers
3|85|Pittsburgh Steelers
3|86|Los Angeles Chargers
3|87|Miami Dolphins|from Eagles
3|88|Jacksonville Jaguars
3|89|Chicago Bears
3|90|Miami Dolphins|from Texans
3|91|Buffalo Bills
3|92|Dallas Cowboys|from 49ers
3|93|Los Angeles Rams
3|94|Miami Dolphins|from Broncos
3|95|New England Patriots
3|96|Seattle Seahawks
3|97|Minnesota Vikings|Compensatory Selection
3|98|Philadelphia Eagles|Compensatory Selection
3|99|Pittsburgh Steelers|Compensatory Selection
3|100|Jacksonville Jaguars|from Lions; Special Compensatory Selection
4|101|Tennessee Titans
4|102|Las Vegas Raiders
4|103|New York Jets
4|104|Arizona Cardinals
4|105|New York Giants
4|106|Houston Texans|from Commanders
4|107|Cleveland Browns
4|108|Denver Broncos|from Saints
4|109|Kansas City Chiefs
4|110|Cincinnati Bengals
4|111|Denver Broncos|from Dolphins
4|112|Dallas Cowboys
4|113|Indianapolis Colts
4|114|Philadelphia Eagles|from Falcons
4|115|Baltimore Ravens
4|116|Tampa Bay Buccaneers
4|117|Las Vegas Raiders|from Vikings through Jaguars
4|118|Detroit Lions
4|119|Carolina Panthers
4|120|Green Bay Packers
4|121|Pittsburgh Steelers
4|122|Atlanta Falcons|from Eagles
4|123|Los Angeles Chargers
4|124|Jacksonville Jaguars
4|125|New England Patriots|from Bears through Chiefs
4|126|Buffalo Bills
4|127|San Francisco 49ers
4|128|Detroit Lions|from Texans
4|129|Chicago Bears|from Rams
4|130|Miami Dolphins|from Broncos
4|131|New England Patriots
4|132|New Orleans Saints|from Seahawks
4|133|San Francisco 49ers|Compensatory Selection
4|134|Las Vegas Raiders|Compensatory Selection
4|135|Pittsburgh Steelers|Compensatory Selection
4|136|New Orleans Saints|Compensatory Selection
4|137|Philadelphia Eagles|Compensatory Selection
4|138|San Francisco 49ers|Compensatory Selection
4|139|San Francisco 49ers|Compensatory Selection
4|140|New York Jets|Compensatory Selection
5|141|Houston Texans|from Raiders through Browns
5|142|Tennessee Titans|from Jets through Ravens
5|143|Arizona Cardinals
5|144|Tennessee Titans|re-acquired through Rams
5|145|New York Giants
5|146|Cleveland Browns
5|147|Washington Commanders
5|148|Kansas City Chiefs
5|149|Cleveland Browns|from Bengals
5|150|New Orleans Saints
5|151|Miami Dolphins
5|152|Dallas Cowboys
5|153|Green Bay Packers|from Falcons through Eagles
5|154|Baltimore Ravens
5|155|Tampa Bay Buccaneers
5|156|Indianapolis Colts
5|157|Detroit Lions
5|158|Carolina Panthers|from Vikings
5|159|Carolina Panthers
5|160|Green Bay Packers
5|161|Pittsburgh Steelers
5|162|Baltimore Ravens|from Chargers
5|163|Minnesota Vikings|from Eagles
5|164|Jacksonville Jaguars
5|165|Buffalo Bills|from Bears
5|166|Jacksonville Jaguars|from 49ers through Eagles
5|167|Houston Texans|re-acquired through Eagles
5|168|Buffalo Bills
5|169|Kansas City Chiefs|from Rams
5|170|Denver Broncos
5|171|New England Patriots
5|172|New Orleans Saints|from Seahawks
5|173|Baltimore Ravens|Compensatory Selection
5|174|Baltimore Ravens|Compensatory Selection
5|175|Las Vegas Raiders|Compensatory Selection
5|176|Kansas City Chiefs|Compensatory Selection
5|177|Dallas Cowboys|Compensatory Selection
5|178|Philadelphia Eagles|Compensatory Selection
5|179|New York Jets|Compensatory Selection
5|180|Dallas Cowboys|Compensatory Selection
5|181|Detroit Lions|Compensatory Selection
6|182|Buffalo Bills|from Jets through Browns, Jaguars and Raiders
6|183|Arizona Cardinals
6|184|Tennessee Titans
6|185|Las Vegas Raiders
6|186|New York Giants
6|187|Washington Commanders
6|188|Seattle Seahawks|from Browns
6|189|Cincinnati Bengals
6|190|New Orleans Saints
6|191|New England Patriots|from Chiefs
6|192|New York Giants|from Dolphins
6|193|New York Giants|from Cowboys
6|194|Tennessee Titans|from Ravens through Jets
6|195|Tampa Bay Buccaneers
6|196|Minnesota Vikings|from Colts
6|197|Philadelphia Eagles|from Falcons
6|198|New England Patriots|from Vikings through Texans, Vikings and 49ers
6|199|Cincinnati Bengals|from Lions through Browns
6|200|Carolina Panthers
6|201|Green Bay Packers
6|202|New England Patriots|from Steelers
6|203|Jacksonville Jaguars|from Eagles through Texans and Eagles
6|204|Los Angeles Chargers
6|205|Detroit Lions|from Jaguars
6|206|Cleveland Browns|from Bears
6|207|Los Angeles Rams|from Texans through Rams and Titans
6|208|Las Vegas Raiders|from Bills through Jets
6|209|Washington Commanders|from 49ers
6|210|Kansas City Chiefs|from Rams
6|211|Baltimore Ravens|from Broncos through Jets, Vikings and Eagles
6|212|New England Patriots
6|213|Detroit Lions|from Seahawks through Jaguars
6|214|Indianapolis Colts|from Steelers; Compensatory Selection
6|215|Atlanta Falcons|from Eagles; Compensatory Selection
6|216|Pittsburgh Steelers|Compensatory Selection
7|217|Arizona Cardinals
7|218|Dallas Cowboys|from Titans
7|219|Las Vegas Raiders
7|220|Buffalo Bills|from Jets
7|221|Cincinnati Bengals|from Giants through Cowboys
7|222|Detroit Lions|from Browns
7|223|Washington Commanders
7|224|Pittsburgh Steelers|from Saints through Patriots
7|225|Tennessee Titans|from Chiefs through Cowboys
7|226|Cincinnati Bengals
7|227|Miami Dolphins
7|228|New York Jets|from Cowboys through Bills and Raiders
7|229|Tampa Bay Buccaneers
7|230|Pittsburgh Steelers|from Colts
7|231|Atlanta Falcons
7|232|Los Angeles Rams|from Ravens
7|233|Jacksonville Jaguars|from Lions
7|234|Minnesota Vikings
7|235|Minnesota Vikings|from Panthers
7|236|Green Bay Packers
7|237|Pittsburgh Steelers
7|238|Miami Dolphins|from Chargers through Titans and Jets
7|239|Chicago Bears|from Eagles through Jaguars and Browns
7|240|Jacksonville Jaguars
7|241|Chicago Bears
7|242|New York Jets|from Bills through Browns
7|243|Houston Texans|from 49ers
7|244|Minnesota Vikings|from Texans
7|245|Jacksonville Jaguars|from Rams through Texans
7|246|Denver Broncos
7|247|New England Patriots
7|248|Cleveland Browns|from Seahawks
7|249|Indianapolis Colts|Compensatory Selection
7|250|Baltimore Ravens|Compensatory Selection
7|251|Los Angeles Rams|Compensatory Selection
7|252|Los Angeles Rams|Compensatory Selection
7|253|Baltimore Ravens|Compensatory Selection
7|254|Indianapolis Colts|Compensatory Selection
7|255|Green Bay Packers|Compensatory Selection
7|256|Denver Broncos|Compensatory Selection
7|257|Denver Broncos|Compensatory Selection
`;

export const DRAFT_ORDER_SOURCE_2026 = NFL_DRAFT_ORDER;

export const DRAFT_PICKS_2026 = RAW_DRAFT_ORDER_2026.trim().split('\n').map((line) => {
  const [round, overall, teamName, note = ''] = line.split('|');
  return {
    round: Number(round),
    overall: Number(overall),
    teamName,
    note,
    source: NFL_DRAFT_ORDER,
  };
});

export const DRAFT_ROUNDS_2026 = Array.from(
  DRAFT_PICKS_2026.reduce((rounds, pick) => {
    if (!rounds.has(pick.round)) rounds.set(pick.round, []);
    rounds.get(pick.round).push(pick);
    return rounds;
  }, new Map()),
  ([round, picks]) => ({ round, picks }),
);
