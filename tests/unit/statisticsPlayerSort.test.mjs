import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getDefaultStatisticsPlayerSort,
  getStatisticsPlayerSortValue,
  sortStatisticsPlayerRows,
} from '../../src/utils/statisticsPlayerSort.js';

const rushing = {
  id: 'rushing',
  columns: ['CAR', 'YDS', 'AVG', 'TD', 'LONG'],
};

const rows = [
  { player: 'Jahmyr Gibbs', values: ['14', '82', '5.9', '1', '22'] },
  { player: 'David Montgomery', values: ['10', '51', '5.1', '0', '14'] },
  { player: 'Aaron Jones', values: ['13', '64', '4.9', '1', '19'] },
];

test('keeps the category default sorted by yards and can sort by average per carry', () => {
  assert.deepEqual(getDefaultStatisticsPlayerSort(rushing), { columnIndex: 1, direction: 'desc' });
  assert.deepEqual(
    sortStatisticsPlayerRows(rows, rushing).map((row) => row.player),
    ['Jahmyr Gibbs', 'Aaron Jones', 'David Montgomery'],
  );
  assert.deepEqual(
    sortStatisticsPlayerRows(rows, rushing, { columnIndex: 2, direction: 'desc' }).map((row) => row.player),
    ['Jahmyr Gibbs', 'David Montgomery', 'Aaron Jones'],
  );
  assert.deepEqual(
    sortStatisticsPlayerRows(rows, rushing, { columnIndex: 2, direction: 'asc' }).map((row) => row.player),
    ['Aaron Jones', 'David Montgomery', 'Jahmyr Gibbs'],
  );
});

test('sorts slash values by their rate and keeps unknown values below known values', () => {
  assert.equal(getStatisticsPlayerSortValue('20/27'), 20 / 27);
  assert.equal(getStatisticsPlayerSortValue('0/0'), null);
  assert.equal(getStatisticsPlayerSortValue('—'), null);

  const passing = { id: 'passing', columns: ['C/ATT', 'YDS', 'TD', 'INT', 'RTG'] };
  const passingRows = [
    { player: 'Low rate', values: ['1/4', '20', '0', '0', '50.0'] },
    { player: 'Unknown', values: ['—', '0', '0', '0', '—'] },
    { player: 'High rate', values: ['3/4', '30', '1', '0', '100.0'] },
  ];
  assert.deepEqual(
    sortStatisticsPlayerRows(passingRows, passing, { columnIndex: 0, direction: 'desc' }).map((row) => row.player),
    ['High rate', 'Low rate', 'Unknown'],
  );
  assert.deepEqual(
    sortStatisticsPlayerRows(passingRows, passing, { columnIndex: 0, direction: 'asc' }).map((row) => row.player),
    ['Low rate', 'High rate', 'Unknown'],
  );
});

test('preserves the input order for tied values', () => {
  const tiedRows = [
    { player: 'First', values: ['4', '20', '5.0', '0', '9'] },
    { player: 'Second', values: ['4', '20', '5.0', '0', '9'] },
  ];
  assert.deepEqual(
    sortStatisticsPlayerRows(tiedRows, rushing, { columnIndex: 2, direction: 'desc' }).map((row) => row.player),
    ['First', 'Second'],
  );
});
