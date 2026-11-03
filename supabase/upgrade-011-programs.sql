-- Run after upgrade-010-universities.sql.
-- Degree-level CRM options, grouped by university and study mode.
-- Specializations can be added under Configuration > Masters > Courses.
-- Sources reviewed 2026-10-31:
-- Amity: https://www.amity.edu/course-list.aspx?fd=Education
--        https://amityonline.com/programs
-- UU (Uttaranchal): https://uudoon.in/admissions/after12th
--                  https://uudoon.in/admissions/after-graduation
--                  https://www.onlineuu.in/index.php
-- SGT (Gurugram): https://sgtuniversity.ac.in/list-of-programmes/
-- GLA: https://www.gla.ac.in/courses and https://glaonline.com/program
-- SMU (Sikkim Manipal): https://www.smu.edu.in/
-- MUJ (Manipal Jaipur): https://www.jaipur.manipal.edu/indian-program-offered-eligibility.php
--                      https://www.onlinemanipal.com/all-courses
-- NMIMS: https://www.nmims.edu/programme-overview
--        https://online.nmims.edu/programs/hub/Bachelors-Program
--        https://online.nmims.edu/
-- Fees are intentionally unset. Existing IDs, fees, and inactive options are preserved.
begin;

with catalog (university, mode, programs) as (
  values
    ('Amity', 'Campus', array[
      'BA', 'B.Arch', 'B.Com', 'B.Des', 'B.Ed', 'B.Pharm', 'B.Sc', 'B.Tech',
      'BBA', 'BCA', 'LLB', 'LLM', 'M.Arch', 'M.Phil', 'MA', 'M.Com', 'M.Des',
      'M.Ed', 'M.Pharm', 'M.Sc', 'M.Tech', 'MBA', 'MCA', 'Diploma', 'PG Diploma', 'PhD'
    ]),
    ('Amity', 'Online', array[
      'BA', 'BA (Journalism and Mass Communication)', 'B.Com', 'B.Com (Hons.)',
      'BBA', 'BCA', 'MBA', 'MCA', 'MA (Journalism and Mass Communication)',
      'M.Com (Financial Management)', 'M.Com (Financial Technology)',
      'MA (Public Policy and Governance)', 'M.Sc (Data Science)'
    ]),
    ('UU', 'Campus', array[
      'BA', 'BA (English)', 'BA (Psychology)', 'BA (Journalism and Mass Communication)',
      'BBA', 'B.Com', 'BCA', 'B.Tech', 'B.Sc (Agriculture)', 'B.Sc (Chemistry)',
      'B.Sc (Mathematics)', 'B.Sc (Food Technology)', 'B.Sc (Biotechnology)',
      'B.Sc (Microbiology)', 'B.Sc (Life Science)', 'B.Sc (Data Science)',
      'B.Sc (Forensic Science)', 'B.Sc (Information Technology)', 'B.Sc (Nursing)',
      'BMLT', 'BMRIT', 'BPT', 'B.Optom', 'BOTT', 'BHMCT',
      'B.Sc (Hotel and Hospitality Administration)', 'BA LLB (Hons.)', 'BBA LLB (Hons.)',
      'B.Pharm', 'D.Pharm', 'Pharm.D', 'MBA', 'MCA', 'M.Tech', 'M.Pharm', 'M.Sc',
      'MPH', 'MPT', 'M.Sc (Medical Laboratory Technology)', 'MHA', 'LLM', 'LLB (Hons.)',
      'MA (English)', 'MA (Clinical Psychology)', 'B.Lib.I.Sc', 'M.Lib.I.Sc',
      'Diploma (Hotel Management)', 'Certificate (Hotel Management)', 'PhD'
    ]),
    ('UU', 'Online', array['BA', 'BBA', 'BCA', 'MBA', 'MCA']),
    ('UU', 'Hybrid', array['Executive MBA']),
    ('SGT', 'Campus', array[
      'BA (Hons.)', 'B.Sc (Hons.)', 'B.Com', 'B.Com (Hons.)', 'BBA', 'BBA-MBA',
      'B.Ed', 'B.Sc B.Ed', 'B.Com B.Ed', 'BA B.Ed', 'B.Tech', 'BCA', 'B.Des', 'BHM',
      'BA LLB (Hons.)', 'LLB (Hons.)', 'BBA LLB (Hons.)',
      'BA (Journalism and Mass Communication)', 'B.Optom', 'BASLP', 'BDS', 'BAMS',
      'MBBS', 'BNYS', 'B.Sc (Nursing)', 'B.Sc (Post Basic Nursing)', 'BPT', 'B.Pharm',
      'M.Sc', 'M.Des', 'MBA', 'M.Phil (Clinical Psychology)', 'M.Clin.Psy', 'MHM',
      'M.Tech', 'MCA', 'LLM', 'M.Ed', 'MA', 'M.Optom', 'MDS', 'MPH', 'MS',
      'M.Sc (Nursing)', 'M.Pharm', 'MPT', 'D.Pharm', 'PhD', 'MD', 'Pharm.D',
      'Professional Diploma (Clinical Psychology)', 'PG Diploma (Psychotherapy and Counselling)'
    ]),
    ('GLA', 'Campus', array[
      'B.Tech', 'BCA', 'BBA (Hons.)', 'BBA (Management Science)', 'BBA (Family Business)',
      'B.Com', 'BA (Economics)', 'BA (English)', 'B.Sc (Biotechnology)',
      'B.Sc (Agriculture)', 'B.Sc (Chemistry)', 'B.Sc (Physics)', 'B.Sc (Mathematics)',
      'B.Pharm', 'BA LLB (Hons.)', 'BBA LLB (Hons.)', 'B.Ed', 'B.Sc B.Ed',
      'M.Tech', 'M.Pharm', 'MBA', 'MBA (Hons.)', 'MCA', 'M.Com',
      'M.Sc (Biotechnology)', 'M.Sc (Microbiology and Immunology)', 'M.Sc (Chemistry)',
      'M.Sc (Physics)', 'M.Sc (Mathematics)', 'M.Sc (Agriculture)', 'LLM', 'D.Pharm',
      'Diploma (Electronics and Communication)', 'Diploma (Civil Engineering)',
      'Diploma (Computer Science Engineering)', 'Diploma (Electrical Engineering)',
      'Diploma (Mechanical Engineering)', 'PhD'
    ]),
    ('GLA', 'Online', array['BBA', 'BCA', 'B.Com (Hons.)', 'MBA', 'MCA']),
    ('SMU', 'Campus', array[
      'B.Tech', 'M.Tech', 'BBA', 'MBA', 'BPES', 'BCA', 'MCA',
      'BA (Psychology)', 'B.Sc (Applied Psychology)', 'B.Sc (Physics)',
      'B.Sc (Chemistry)', 'B.Sc (Mathematics)', 'M.Sc (Chemistry)', 'M.Sc (Physics)',
      'M.Sc (Mathematics)', 'MBBS', 'B.Sc (Medical Biotechnology)',
      'M.Sc (Medical Biotechnology)', 'MD', 'MS', 'B.Sc (Nursing)', 'M.Sc (Nursing)',
      'BHA', 'MHA', 'BPT', 'MPT', 'PhD'
    ]),
    ('SMU', 'Online', array[
      'BA', 'B.Com', 'MBA', 'MCA', 'M.Com', 'MA (English)',
      'MA (Sociology)', 'MA (Political Science)'
    ]),
    ('MUJ', 'Campus', array[
      'B.Arch', 'B.Des', 'BA', 'B.Sc', 'B.Com', 'BBA', 'BCA', 'B.Tech', 'BFA', 'BPES',
      'BHM', 'BA (Journalism and Mass Communication)', 'BA LLB', 'BBA LLB', 'LLB',
      'B.Pharm', 'M.Arch', 'M.Plan', 'MA (English)', 'MA (Economics)',
      'MA (International Relations)', 'MFA (Applied Arts)', 'M.Sc (Biotechnology)',
      'M.Sc (Chemistry)', 'M.Sc (Mathematics)', 'M.Sc (Mathematics and Computing)',
      'M.Sc (Physics)', 'M.Sc (Food Science and Technology)', 'M.Com (Financial Analysis)',
      'MCA', 'M.Sc (Cyber Security)', 'M.Des (Interior Design)', 'M.Tech', 'MBA',
      'MA (Journalism and Mass Communication)', 'LLM', 'M.Sc (Clinical Psychology)', 'PhD'
    ]),
    ('MUJ', 'Online', array[
      'BBA', 'BCA', 'B.Com', 'MBA', 'MCA', 'M.Com', 'MA (Economics)',
      'MA (Journalism and Mass Communication)', 'M.Sc (Mathematics)'
    ]),
    ('NMIMS', 'Campus', array[
      'B.Tech', 'B.Sc', 'B.Arch', 'B.Des', 'BA LLB', 'BBA LLB', 'BBA', 'B.Com',
      'BA (Music)', 'BA (Liberal Arts)', 'B.Sc (Economics)', 'B.Sc (Applied Psychology)',
      'B.Sc (Biomedical Science)', 'B.Sc (Finance)', 'MBA Pharma Tech', 'MBA Tech',
      'M.Sc (Economics)', 'MBA', 'MCA', 'M.Tech', 'M.Sc (Data Science)',
      'M.Sc (Applied Statistics and Analytics)', 'M.Sc (Statistics and Data Science)',
      'M.Sc (Finance)', 'M.Pharm', 'D.Pharm', 'PhD'
    ]),
    ('NMIMS', 'Online', array['BBA', 'B.Com', 'MBA', 'MBA (Working Executive)'])
), desired as (
  select u.id as university_id, program || ' - ' || catalog.mode as name
  from catalog
  join public.universities u on lower(u.name) = lower(catalog.university)
  cross join lateral unnest(catalog.programs) as p(program)
)
insert into public.courses (university_id, name)
select desired.university_id, desired.name
from desired
where not exists (
  select 1 from public.courses existing
  where existing.university_id = desired.university_id
    and lower(existing.name) = lower(desired.name)
)
on conflict do nothing;

commit;
