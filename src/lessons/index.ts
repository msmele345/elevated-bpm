import { DEFAULT_ARC_ID } from '../model/projectState'
import { parseLesson, type Lesson } from '../model/lesson'
import type { ArcFinale } from '../model/finale'
import backbeatClap from './backbeat-clap.json'
import bassMovement from './bass-movement.json'
import buildYourOwnKit from './build-your-own-kit.json'
import envelopePluck from './envelope-pluck.json'
import filterSweep from './filter-sweep.json'
import findTheChop from './find-the-chop.json'
import firstBassline from './first-bassline.json'
import fitTheBreak from './fit-the-break.json'
import fourOnTheFloor from './four-on-the-floor.json'
import kickAccents from './kick-accents.json'
import loadASound from './load-a-sound.json'
import offbeatHats from './offbeat-hats.json'
import openHatLift from './open-hat-lift.json'
import peakTimeTempo from './peak-time-tempo.json'
import resonanceSquelch from './resonance-squelch.json'
import stabChord from './stab-chord.json'
import stabHits from './stab-hits.json'
import trimItTight from './trim-it-tight.json'
import tuneAPad from './tune-a-pad.json'
import yourFirstTechnoGroove from './your-first-techno-groove.json'

/**
 * The curriculum, as tracks.
 *
 * Lessons are pure data — this file is the running order and nothing else, so
 * adding a lesson is a JSON file plus one line here, and adding a *track* is one
 * more entry in `ARCS`. Everything downstream (navigation, progress, the
 * selector, inheritance, the shipped-arc contract) reads this list rather than
 * naming an arc of its own.
 */
export interface CurriculumArc {
  id: string
  /** The name on the track selector. */
  title: string
  /** One line saying what the track teaches. */
  blurb: string
  lessons: Lesson[]
  /** What the graduation moment says when this track is finished. */
  finale: ArcFinale
}

/**
 * The v1 techno arc, unchanged: one ordered path from silence to a full groove.
 *
 * The order is the teaching: rhythm from the ground up (kick, hats, clap,
 * dynamics, tempo), then the bass that plays around it, then the sound design
 * that shapes the bass, then the stabs on top, and finally the capstone that
 * asks for all of it at once.
 */
const TECHNO_ARC: CurriculumArc = {
  id: DEFAULT_ARC_ID,
  title: 'Techno',
  blurb: 'Silence to a full groove, one part at a time.',
  lessons: [
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
  ].map(parseLesson),
  finale: {
    kicker: 'Final challenge complete · EB-01 certified',
    lead: 'You made',
    headline: 'techno',
    copy: 'That groove is not a preset. You built the kick, the lift, the bass movement and the stabs — one machine, speaking in your voice.',
    close: 'Keep it rolling',
    scale: 'grand',
  },
}

/**
 * The Sampling Arc: the craft the sampler exists for, taught against a break
 * the app knows well enough to be specific about.
 *
 * It starts with the learner bringing audio in themselves — deliberately, since
 * the curated break is pre-installed and would otherwise hand them the first
 * lesson — and ends with a kit built out of their own material.
 */
const SAMPLING_ARC: CurriculumArc = {
  id: 'sampling',
  title: 'Sampling',
  blurb: 'Load, chop, trim, fit, tune — build a kit of your own.',
  lessons: [loadASound, findTheChop, trimItTight, fitTheBreak, tuneAPad, buildYourOwnKit].map(
    parseLesson,
  ),
  finale: {
    kicker: 'Sampling track complete · SP-04 certified',
    lead: 'You built',
    headline: 'your own kit',
    copy: 'Those are your sounds, found and trimmed and tuned by hand. Every record worth sampling is now material.',
    close: 'Back to the deck',
    // Deliberately the smaller of the two: the techno arc is the product's
    // spine and its graduation stays the biggest moment on the deck. But
    // finishing a track with nothing at the end reads as an unfinished feature.
    scale: 'compact',
  },
}

export const ARCS: readonly CurriculumArc[] = [TECHNO_ARC, SAMPLING_ARC]

/**
 * The track a document names, or the first one when it names nothing this
 * build has. A retired arc id must leave the deck on a real path rather than
 * on nothing at all.
 */
export function arcById(arcId: string): CurriculumArc {
  return ARCS.find((arc) => arc.id === arcId) ?? ARCS[0]
}

/**
 * Every lesson the app ships, across every track. What inheritance is measured
 * against: a beat that arrives already built must not earn credit on *either*
 * path, so this deliberately iterates the registry rather than one arc.
 */
export const ALL_LESSONS: Lesson[] = ARCS.flatMap((arc) => arc.lessons)
