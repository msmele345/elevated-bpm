import { parseLesson, type Lesson } from '../model/lesson'
import backbeatClap from './backbeat-clap.json'
import bassMovement from './bass-movement.json'
import envelopePluck from './envelope-pluck.json'
import filterSweep from './filter-sweep.json'
import firstBassline from './first-bassline.json'
import fourOnTheFloor from './four-on-the-floor.json'
import kickAccents from './kick-accents.json'
import offbeatHats from './offbeat-hats.json'
import openHatLift from './open-hat-lift.json'
import peakTimeTempo from './peak-time-tempo.json'
import resonanceSquelch from './resonance-squelch.json'
import stabChord from './stab-chord.json'
import stabHits from './stab-hits.json'
import yourFirstTechnoGroove from './your-first-techno-groove.json'

/**
 * The v1 curriculum arc: one ordered path from silence to a full techno
 * groove. Lessons are pure data — this file is the running order and nothing
 * else, so adding a lesson is a JSON file plus one line here.
 *
 * The order is the teaching: rhythm from the ground up (kick, hats, clap,
 * dynamics, tempo), then the bass that plays around it, then the sound design
 * that shapes the bass, then the stabs on top, and finally the capstone that
 * asks for all of it at once.
 */
export const ARC: Lesson[] = [
  fourOnTheFloor,
  offbeatHats,
  backbeatClap,
  openHatLift,
  kickAccents,
  peakTimeTempo,
  firstBassline,
  bassMovement,
  filterSweep,
  resonanceSquelch,
  envelopePluck,
  stabHits,
  stabChord,
  yourFirstTechnoGroove,
].map(parseLesson)
