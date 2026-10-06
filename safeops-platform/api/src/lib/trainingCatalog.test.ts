import { describe, expect, it } from 'vitest'
import { TRAINING_COURSES } from './trainingCatalog.js'
import { REQUIRED_COMPETENCY } from './permitPeople.js'

describe('training catalogue and permit competencies', () => {
  it('offers a course for every competency a permit type requires', () => {
    // The permit rules match a person's certificates by course name. Hot work, electrical
    // isolation, LOTO, lifting and radiography asked for courses the catalogue did not have,
    // so nobody could ever qualify and those permits could never start with staff named.
    for (const [type, required] of Object.entries(REQUIRED_COMPETENCY)) {
      const course = TRAINING_COURSES.find((c) => c.name.toLowerCase().includes(required!.toLowerCase()))
      expect(course, `${type} needs a "${required}" course`).toBeDefined()
    }
  })
})
