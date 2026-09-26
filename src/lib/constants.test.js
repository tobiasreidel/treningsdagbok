import { describe, it, expect } from 'vitest'
import { matchExercise, exerciseLabel } from './constants'

// Two spellings of one lift are two lines in the strength stats, and nothing
// on screen says they were meant to be one. So a typed name is matched before
// it is kept.
describe('your own strength exercises', () => {
  it('reads a built-in however it is typed', () => {
    expect(matchExercise('pull ups')).toBe('pullups')
    expect(matchExercise('  Shoulder-Press ')).toBe('shoulderpress')
  })

  it('reuses one of your own instead of adding a second spelling', () => {
    expect(matchExercise('bench  PRESS', ['Bench press'])).toBe('Bench press')
  })

  it('keeps a new name as typed, tidied', () => {
    expect(matchExercise('  Bulgarian   split squat ')).toBe('Bulgarian split squat')
    expect(matchExercise('bench  Press')).toBe('Bench Press')
    expect(matchExercise('   ')).toBe(null)
  })

  it('labels a custom exercise with its own name', () => {
    expect(exerciseLabel('Bench press')).toBe('Bench press')
    expect(exerciseLabel('pullups')).toBe('Pull-ups')
  })
})
