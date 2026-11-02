export type HelpTopicId =
  | 'allocation-mapping'
  | 'allocation-calculation'
  | 'allocation-validation'
  | 'allocation-weekly-hours'
  | 'bench'
  | 'generated-risks'
  | 'lens-summary'
  | 'person-basic'
  | 'person-collaboration'
  | 'person-cost-layers'
  | 'person-monthly-override'
  | 'people-palette'
  | 'person-skills'
  | 'period-planning'
  | 'people-availability'
  | 'project-basic'
  | 'project-monthly-split'
  | 'project-people-fit'
  | 'project-requirements'
  | 'project-risks'
  | 'relationship-overlay'
  | 'tile-scale'
  | 'traffic-review'
  | 'visual-inventory'
  | 'weekly-drilldown';

export interface HelpTopicSection {
  heading: string;
  body: string;
}

export interface HelpTopic {
  id: HelpTopicId;
  title: string;
  summary: string;
  tags: string[];
  sections: HelpTopicSection[];
}

export const helpTopics: HelpTopic[] = [
  {
    id: 'people-palette',
    title: 'Paleta ludzi',
    summary: 'Wyjasnia, jak uzywac osob i kafelkow z lewej palety.',
    tags: ['ludzie', 'paleta', 'drag', 'kafelki', 'reset'],
    sections: [
      {
        heading: 'Co pokazuje ta sekcja?',
        body: 'Paleta pokazuje aktywne osoby, ich koszt, kompetencje i kafelki, ktore w aktywnym miesiacu nie sa jeszcze przypisane do projektu.',
      },
      {
        heading: 'Jak planowac?',
        body: 'Przeciagnij cala osobe na projekt, zeby przeniesc jej wolne kafelki, albo przeciagnij pojedynczy kafelek, jesli chcesz przypisac tylko czesc miesiaca.',
      },
      {
        heading: 'Reset osoby',
        body: 'Gdy osoba ma kafelki w projektach, przy jej karcie pojawia sie Reset. Przenosi wszystkie kafelki tej osoby z aktywnego miesiaca z powrotem na lawke.',
      },
      {
        heading: 'Reset projektow',
        body: 'Panel projektow ma akcje Reset alok. Po drugim kliknieciu w Potwierdz przenosi wszystkie kafelki przypisane do projektow w aktywnym miesiacu z powrotem na lawke.',
      },
      {
        heading: 'Czysty miesiac',
        body: 'Dolny pasek Diablo ma akcje Wyczysc miesiac. Ukrywa osoby i projekty tylko w aktywnym miesiacu oraz usuwa jego kafelki, bez archiwizacji i bez kasowania rekordow z bazy.',
      },
    ],
  },
  {
    id: 'person-basic',
    title: 'Dane osoby i model kosztu',
    summary: 'Wyjasnia podstawowe pola osoby, koszt i domyslne godziny.',
    tags: ['osoba', 'koszt', 'godziny', 'seniority'],
    sections: [
      {
        heading: 'Co zmienia ta sekcja?',
        body: 'Ustawia podstawowe dane osoby, domyslna dostepnosc miesieczna, koszt wewnetrzny i to, ile godzin reprezentuje jeden kafelek tej osoby.',
      },
      {
        heading: 'Gdzie to widac?',
        body: 'Te pola wplywaja na koszt miesiaca, wykorzystanie osoby, kalkulacje marzy i liczbe kafelkow generowanych dla osoby.',
      },
    ],
  },
  {
    id: 'person-monthly-override',
    title: 'Dostepnosc i koszt w miesiacu',
    summary: 'Wyjasnia nadpisania osoby dla konkretnego miesiaca.',
    tags: ['osoba', 'miesiac', 'dostepnosc', 'koszt', 'hr'],
    sections: [
      {
        heading: 'Co zmienia ta sekcja?',
        body: 'Nadpisuje dostepne godziny, koszt i progi celu tylko dla wybranego miesiaca. Bazowe ustawienia osoby zostaja bez zmian.',
      },
      {
        heading: 'Kiedy tego uzywac?',
        body: 'Uzyj tego przy urlopie, notice period, czesciowej dostepnosci, zmianie kosztu w danym miesiacu albo tymczasowym celu przychodu.',
      },
    ],
  },
  {
    id: 'person-skills',
    title: 'Kompetencje osoby',
    summary: 'Wyjasnia, jak kompetencje osoby pokrywaja wymagania projektu.',
    tags: ['osoba', 'kompetencje', 'wymagania', 'alokacje'],
    sections: [
      {
        heading: 'Co zmienia ta sekcja?',
        body: 'Okresla kompetencje osoby uzywane do automatycznego dopasowania kafelkow do wymagan projektow.',
      },
      {
        heading: 'Jak to dziala z alokacja?',
        body: 'Jesli projekt wymaga jednej pasujacej kompetencji, kafelek osoby liczy sie do pokrycia bez recznego mapowania. Reczne mapowanie jest potrzebne przy niejednoznacznych przypadkach.',
      },
    ],
  },
  {
    id: 'person-collaboration',
    title: 'Ryzyka wspolpracy osoby',
    summary: 'Wyjasnia blokady planowania osob razem w jednym projekcie.',
    tags: ['osoba', 'ryzyka', 'hr', 'wspolpraca'],
    sections: [
      {
        heading: 'Co zmienia ta sekcja?',
        body: 'Pozwala oznaczyc osoby, ktorych nie powinno sie planowac razem w jednym projekcie.',
      },
      {
        heading: 'Gdzie pojawi sie efekt?',
        body: 'Board nadal pozwoli przeciagac kafelki, ale wygeneruje ostrzezenie na alokacjach, w ryzykach projektu oraz w perspektywach PM/HR.',
      },
    ],
  },
  {
    id: 'person-cost-layers',
    title: 'Warstwy kosztu i celu',
    summary: 'Wyjasnia progi kosztu pracy, overheadu, sprzedazy i celu.',
    tags: ['osoba', 'koszt', 'cel', 'marza'],
    sections: [
      {
        heading: 'Co zmienia ta sekcja?',
        body: 'Ustawia progi, ktore mowia ile przychodu osoba powinna pokryc: koszt pracy, admin/biuro, sprzedaz/marketing i docelowy przychod.',
      },
      {
        heading: 'Dlaczego to wazne?',
        body: 'Te warstwy pomagaja rozroznic samo pokrycie kosztu od zdrowego celu biznesowego miesiaca.',
      },
    ],
  },
  {
    id: 'project-basic',
    title: 'Dane projektu i stawki',
    summary: 'Wyjasnia typ kontraktu, charakter pracy, etap, przychod, prawdopodobienstwo i stawki.',
    tags: ['projekt', 'kontrakt', 'stawki', 'przychod', 'rd', 'poczekalnia', 'scope'],
    sections: [
      {
        heading: 'Co zmienia ta sekcja?',
        body: 'Okresla, jak projekt liczy przychod, czy jest aktywny czy pipeline, jaka ma szanse, jaki ma charakter pracy oraz jak przelicza przychod na godziny.',
      },
      {
        heading: 'Charakter pracy',
        body: 'Charakter pracy rozroznia projekt komercyjny, R&D, poczekalnie i defensywny maintenance. To zasila fioletowe/pomaranczowe patterny na karcie projektu, markery osoby oraz triggery long-term traffic.',
      },
      {
        heading: 'Spójnosc zrodla i scope',
        body: 'Status zrodla/scope pokazuje, czy board jest zgodny z CRM, briefem albo aktualna decyzja handlowa. Brak lub przestarzaly wpis nie blokuje planowania, ale staje sie widocznym triggerem PM/Sales.',
      },
      {
        heading: 'Stawki',
        body: 'Stawka klienta mowi, ile godzin kupuje budzet. Docelowa stawka firmy sluzy do sprawdzenia, czy te godziny powinny generowac wiekszy przychod.',
      },
    ],
  },
  {
    id: 'project-monthly-split',
    title: 'Podzial przychodu na miesiace',
    summary: 'Wyjasnia reczny split przychodu dla projektow fixed/multi-month.',
    tags: ['projekt', 'przychod', 'miesiace', 'fixed'],
    sections: [
      {
        heading: 'Co zmienia ta sekcja?',
        body: 'Rozklada planowany i podpisany przychod projektu na konkretne miesiace. To nie jest harmonogram platnosci.',
      },
      {
        heading: 'Kiedy tego uzywac?',
        body: 'Uzyj przy projektach fixed phase albo multi-month, gdy jeden budzet trzeba pokazac jako rozklad komercyjny po miesiacach.',
      },
    ],
  },
  {
    id: 'project-people-fit',
    title: 'Preferowane i zablokowane osoby',
    summary: 'Wyjasnia dopasowanie osob do projektu.',
    tags: ['projekt', 'osoby', 'preferencje', 'blokady'],
    sections: [
      {
        heading: 'Co zmienia ta sekcja?',
        body: 'Pozwala wskazac osoby preferowane do projektu oraz osoby, ktorych nie powinno sie przypisywac.',
      },
      {
        heading: 'Czy blokuje drag/drop?',
        body: 'Nie blokuje planowania. System pozwala eksperymentowac, ale pokazuje wyrazne ryzyka na kafelkach i w podsumowaniach.',
      },
    ],
  },
  {
    id: 'allocation-mapping',
    title: 'Mapowanie kafelka do wymagania',
    summary: 'Wyjasnia, co zmienia edycja pojedynczego kafelka osoby.',
    tags: ['alokacja', 'kafelek', 'kompetencja', 'wymaganie', 'walidacja'],
    sections: [
      {
        heading: 'Co to robi?',
        body: 'Klik w kafelek otwiera edycje jednej konkretnej alokacji osoby. Recznie ustawiasz tam kompetencje albo wymaganie tylko wtedy, gdy automatyczne dopasowanie z profilu osoby jest niejednoznaczne.',
      },
      {
        heading: 'Czego to nie robi?',
        body: 'Nie zmienia calej lawki, wszystkich kafelkow osoby ani budzetu projektu. Board nadal traktuje pojedynczy kafelek jako atom planowania miesiaca.',
      },
      {
        heading: 'Przyklad',
        body: 'Jesli osoba ma Backend w profilu, a projekt ma jedno wymaganie Backend, przeciagniety kafelek liczy sie do pokrycia tego wymagania bez dodatkowej edycji. Reczne mapowanie jest potrzebne np. gdy osoba ma kilka pasujacych kompetencji albo chcesz nadpisac domyslne dopasowanie.',
      },
    ],
  },
  {
    id: 'allocation-calculation',
    title: 'Kalkulacja kafelka',
    summary: 'Wyjasnia stawki, koszt wewnetrzny i brak do celu.',
    tags: ['alokacja', 'kalkulacja', 'stawki', 'marza'],
    sections: [
      {
        heading: 'Co pokazuje ta sekcja?',
        body: 'Pokazuje, jaka stawka przelicza kafelek na godziny, jaki jest koszt wewnetrzny osoby i czy przychod kafelka pokrywa target.',
      },
      {
        heading: 'Czy to zmienia board?',
        body: 'Ta sekcja sama nic nie zmienia. Wyjasnia skutki aktualnego przypisania jednego kafelka.',
      },
    ],
  },
  {
    id: 'allocation-validation',
    title: 'Walidacja kafelka',
    summary: 'Wyjasnia ostrzezenia i markery spotkania widoczne w edytorze alokacji.',
    tags: ['alokacja', 'walidacja', 'ryzyka', 'spotkanie', 'handoff', 'plan b'],
    sections: [
      {
        heading: 'Co pokazuje ta sekcja?',
        body: 'Pokazuje ryzyka dla tego jednego kafelka: kompetencje, seniority, preferencje projektu, konflikty wspolpracy, koszt i target revenue.',
      },
      {
        heading: 'Czy blokuje planowanie?',
        body: 'Nie. Board pozwala dalej planowac, ale ostrzezenia pomagaja zobaczyc, ktore przypisania trzeba poprawic.',
      },
      {
        heading: 'Markery spotkania',
        body: 'Markery takie jak bez zmian, zmienione w tym tygodniu, handoff, Plan B, mentoring i backup sa decyzjami spotkania. Edytor zapisuje je na calej grupie osoba-projekt-miesiac, nawet jesli otwierasz pojedynczy kafelek.',
      },
      {
        heading: 'Markery wyliczane',
        body: 'Czesc markerow powstaje automatycznie: 20h+ z godzin, HR z miesiecznej dostepnosci, bench/0h dla pracy poza projektem lub osoby bez produktywnej pracy, malo/niska dla poziomu niedociazenia, R&D/wait/low z charakteru projektu, a PM z kompetencji osoby.',
      },
    ],
  },
  {
    id: 'visual-inventory',
    title: 'Inwentarz patternow',
    summary: 'Wyjasnia kolory, glyphy, markery i stany kart uzywane do szybkiego czytania boardu.',
    tags: ['legenda', 'patterny', 'miro', 'kolory', 'glyphy', 'stany'],
    sections: [
      {
        heading: 'Po co jest inwentarz?',
        body: 'Inwentarz tlumaczy jezyk wizualny boardu. To nie jest raport. Ma pomoc szybko rozpoznac patterny na kartach projektow i osob bez otwierania szczegolowych list.',
      },
      {
        heading: 'Kolory',
        body: 'Czerwony oznacza nacisk lub ryzyko, zolty luke albo niepewnosc, zielony zdrowe pokrycie, niebieski rezerwacje lub przyszla szanse, pomaranczowy prace defensywna, a fioletowy R&D, poczekalnie albo niska wartosc komercyjna.',
      },
      {
        heading: 'Glyphy i karty osob',
        body: 'Skill i seniority sa widoczne na osobie jako male znaczniki. Cala karta osoby moze dostac stan wizualny, np. fragmentacja, HR context, lawka/bez projektu, niedociazenie, R&D/wait, mentoring, backup albo 20h+.',
      },
      {
        heading: 'Tygodnie na karcie osoby',
        body: 'Pasek W1/W2/W3 na karcie osoby pokazuje rozklad godzin w tygodniach miesiaca. Zwykly kafelek oznacza rozlanie proporcjonalne, kreskowany zolty kafelek oznacza reczny weekly override, a mocny dolny pasek oznacza tydzien z obciazeniem 20h+.',
      },
      {
        heading: 'Karta projektu',
        body: 'Karta projektu jest glowna rama inwentarza. Ramka pokazuje zajete miejsce, puste okno, pule fixed-price, overflow oraz stany projektu takie jak jedna osoba, niedobor ludzi, R&D, poczekalnia, niska wartosc i scope/source mismatch.',
      },
    ],
  },
  {
    id: 'relationship-overlay',
    title: 'Relacje i przesuniecia',
    summary: 'Wyjasnia relacje miedzy przypisaniami osob w projektach i miesiacu.',
    tags: ['relacje', 'ruch', 'handoff', 'backup', 'mentoring', 'fragmentacja'],
    sections: [
      {
        heading: 'Co pokazuje overlay?',
        body: 'Overlay miesiaca zbiera relacje widoczne na kartach projektow: stabilne przypisania, ruch z poprzedniego targetu, zmiany w tygodniu, handoffy, Plan B, mentoring, backup i osoby rozciete miedzy kilka miejsc. Gdy oba konce relacji sa widoczne, board rysuje tez lekka linie miedzy ramkami.',
      },
      {
        heading: 'Skad bierze sie ruch?',
        body: 'Ruch pochodzi z lekkiego pola previousTarget. Ustawia sie przy drag/drop, resetach do lawki, ukrywaniu projektu albo recznym oznaczeniu w edytorze alokacji.',
      },
      {
        heading: 'Czego jeszcze nie pokazuje?',
        body: 'To nie jest pelna historia audytowa. Linie sa tylko lekkim overlayem dla widocznych ramek i maja wspierac pattern recognition bez zaslaniania boardu.',
      },
    ],
  },
  {
    id: 'traffic-review',
    title: 'Traffic review',
    summary: 'Wyjasnia tryby short-term i long-term oraz role triggerow spotkania.',
    tags: ['traffic', 'spotkanie', 'short term', 'long term', 'agenda', 'triggery'],
    sections: [
      {
        heading: 'Po co jest ten panel?',
        body: 'Traffic Review zamienia agende spotkania i pytania pomocnicze w lekkie checklisty oraz triggery oparte na aktualnym boardzie. Ma wspierac rozmowe, nie zastepowac widoku kart projektu.',
      },
      {
        heading: 'Short term',
        body: 'Short term patrzy na najblizszy cykl: zmiany w tygodniu, handoffy, Plan B, backup, BE/FE/QA, onboarding, budzet, scope mismatch i przeciazenia.',
      },
      {
        heading: 'Long term',
        body: 'Long term patrzy na horyzont okolo 3 miesiecy: pipeline, underload, R&D/poczekalnie, single point of failure, luki kompetencji, konce umow, budzet/marze i over-promise.',
      },
      {
        heading: 'Role',
        body: 'Kazdy trigger ma wlasciciela roli, np. HR, PM, Tech, Sales albo Finance, oraz sugerowana akcje. To ma przyspieszyc przydzielanie follow-upow przed kolejnym planningiem.',
      },
    ],
  },
  {
    id: 'allocation-weekly-hours',
    title: 'Godziny tygodniowe kafelka',
    summary: 'Wyjasnia tygodniowy rozklad godzin jednej alokacji.',
    tags: ['alokacja', 'tygodnie', 'godziny'],
    sections: [
      {
        heading: 'Co zmienia ta sekcja?',
        body: 'Pozwala rozlozyc miesieczne godziny jednego kafelka na tygodnie. Miesiac pozostaje finansowym zrodlem prawdy.',
      },
      {
        heading: 'Kiedy tego uzywac?',
        body: 'Uzyj, gdy praca nie jest rowno rozlozona w miesiacu albo chcesz zobaczyc realne przeciazenia tygodniowe.',
      },
    ],
  },
  {
    id: 'project-requirements',
    title: 'Wymagania projektu',
    summary: 'Pokazuje, jak projekty licza pokrycie kompetencji i godzin.',
    tags: ['projekt', 'wymagania', 'kompetencje', 'godziny'],
    sections: [
      {
        heading: 'Co oznacza licznik?',
        body: 'Wymaganie typu Fullstack mid: 0/32h pokazuje, ile godzin z wymaganej kompetencji jest pokryte kafelkami w tym projekcie.',
      },
      {
        heading: 'Skad bierze sie pokrycie?',
        body: 'Pokrycie rosnie, gdy osoba z kafelka ma jednoznacznie pasujaca kompetencje w profilu, kafelek ma ustawiona pasujaca kompetencje albo jest zmapowany na konkretne wymaganie projektu.',
      },
      {
        heading: 'Czego to nie oznacza?',
        body: 'To nie jest osobny task manager ani lista zadan. To szybki sygnal, czy miesieczny plan ma odpowiednia pojemnosc i kompetencje.',
      },
    ],
  },
  {
    id: 'project-risks',
    title: 'Ryzyka projektu',
    summary: 'Wyjasnia liste ryzyk widoczna na karcie projektu.',
    tags: ['ryzyka', 'projekt', 'walidacja', 'kafelki'],
    sections: [
      {
        heading: 'Skad sa ryzyka?',
        body: 'Ryzyka pochodza z walidacji kafelkow przypisanych do projektu: kompetencji, seniority, preferencji ludzi, blokad, konfliktow wspolpracy, kosztow i target rate.',
      },
      {
        heading: 'Jak je czytac?',
        body: 'Kazdy wpis pokazuje osobe i konkretny komunikat. Jesli ryzyk jest wiecej, uzyj przycisku pokazujacego pelna liste.',
      },
      {
        heading: 'Co z tym zrobic?',
        body: 'Najczesciej trzeba przemapowac kafelek na wlasciwe wymaganie, podmienic osobe, zmienic sklad projektu albo zweryfikowac stawke i zakres.',
      },
    ],
  },
  {
    id: 'generated-risks',
    title: 'Ryzyka wygenerowane',
    summary: 'Agregaty ryzyk dla aktywnego miesiaca.',
    tags: ['ryzyka', 'miesiac', 'podsumowanie', 'walidacja'],
    sections: [
      {
        heading: 'Co pokazuje ta sekcja?',
        body: 'To podsumowanie najwazniejszych problemow w aktywnym miesiacu: brak do celu, koszt lawki, ostrzezenia alokacji, stawki, wymagane kompetencje i konflikty zespolu.',
      },
      {
        heading: 'Dlaczego widze przyklady?',
        body: 'Agregat bez przykladow jest malo uzyteczny, dlatego karta pokazuje konkretne osoby, projekty i pierwsze komunikaty walidacyjne.',
      },
      {
        heading: 'Czego to nie robi?',
        body: 'Ta sekcja nie zmienia planu automatycznie. To mapa ryzyk, ktora pomaga zdecydowac, co poprawic na boardzie.',
      },
    ],
  },
  {
    id: 'lens-summary',
    title: 'Soczewki i podsumowanie',
    summary: 'Wyjasnia, dlaczego kazda perspektywa pokazuje inne sygnaly.',
    tags: ['soczewka', 'zarzad', 'finance', 'sales', 'pm', 'hr'],
    sections: [
      {
        heading: 'Po co sa soczewki?',
        body: 'Soczewka filtruje sygnaly pod konkretna perspektywe. Zarzad patrzy szeroko, finanse na stawki, koszty i marze, PM na realizacje, HR na obciazenie i dopasowanie ludzi.',
      },
      {
        heading: 'Co oznacza podsumowanie?',
        body: 'Podsumowanie pokazuje najwazniejsze ostrzezenia dla wybranej soczewki, razem z przykladami osob i projektow.',
      },
      {
        heading: 'Czego to nie jest?',
        body: 'To nie jest osobny raport finansowy ani CRM. To skrot do szybkiego czytania tego samego miesiecznego boardu z roznych punktow widzenia.',
      },
    ],
  },
  {
    id: 'people-availability',
    title: 'Dostepnosc ludzi w miesiacu',
    summary: 'Wyjasnia koszt, cel, godziny i wykorzystanie osob w aktywnym miesiacu.',
    tags: ['ludzie', 'dostepnosc', 'koszt', 'cel', 'utilization'],
    sections: [
      {
        heading: 'Co pokazuje ta sekcja?',
        body: 'Dostepnosc ludzi pokazuje, ile godzin i celu przychodowego ma dana osoba w miesiacu oraz ile z tego jest juz przypisane do projektow.',
      },
      {
        heading: 'Skad biora sie liczby?',
        body: 'Godziny i koszt pochodza z profilu osoby oraz miesiecznych nadpisan. Przydzial liczy kafelki alokacji przypisane do projektow w tym miesiacu.',
      },
      {
        heading: 'Czego to nie jest?',
        body: 'To nie jest timesheet ani finalny kosztorys. To szybki widok planowania pojemnosci ludzi w miesiacu.',
      },
    ],
  },
  {
    id: 'period-planning',
    title: 'Zakres planowania miesiecy',
    summary: 'Wyjasnia dodawanie i przelaczanie miesiecy.',
    tags: ['miesiac', 'zakres', 'planowanie', 'okres'],
    sections: [
      {
        heading: 'Co robi ten panel?',
        body: 'Panel sluzy do dodania czystego miesiaca, przelaczania aktywnego miesiaca i zmiany zakresu widocznych miesiecy.',
      },
      {
        heading: 'Czego nie robi?',
        body: 'Nie kopiuje planu z innego miesiaca. Nowy miesiac startuje z czystej bazy, zeby nie powielac blednie ulozonych danych.',
      },
      {
        heading: 'Dlaczego jest domyslnie zwiniety?',
        body: 'Glownym widokiem ma byc board aktywnego miesiaca. Panel miesiecy jest narzedziem pomocniczym.',
      },
    ],
  },
  {
    id: 'bench',
    title: 'Lawka / nieprzypisany cel',
    summary: 'Wyjasnia, czym sa niewykorzystane kafelki osob.',
    tags: ['lawka', 'bench', 'kafelki', 'osoby'],
    sections: [
      {
        heading: 'Co to jest lawka?',
        body: 'Lawka pokazuje kafelki osob, ktore w danym miesiacu nie sa przypisane do projektu. Jezeli osoba ma tylko takie kafelki i 0h produktywnej pracy, board pokazuje mocniejszy stan bez projektu.',
      },
      {
        heading: 'Jak tego uzywac?',
        body: 'Przeciagaj pojedyncze kafelki z lawki na projekt, zeby przypisac czesc pojemnosci osoby do pracy projektowej.',
      },
      {
        heading: 'Czego to nie jest?',
        body: 'Lawka nie jest projektem ani koszykiem do edycji wszystkich alokacji naraz. To miejsce startowe dla nieprzypisanych kafelkow.',
      },
    ],
  },
  {
    id: 'weekly-drilldown',
    title: 'Podzial tygodniowy',
    summary: 'Operacyjny drill-down miesiaca na tygodnie.',
    tags: ['tygodnie', 'godziny', 'obciazenie', 'drilldown'],
    sections: [
      {
        heading: 'Po co jest podzial tygodniowy?',
        body: 'Miesiac zostaje glowna jednostka finansowa, ale tygodnie pokazuja, czy plan da sie realnie dowiezc operacyjnie.',
      },
      {
        heading: 'Co mozna sprawdzic?',
        body: 'Zobaczysz obciazenie osob, przeciążenia tygodniowe i prace projektowa rozlozona po tygodniach.',
      },
      {
        heading: 'Czego to nie zmienia?',
        body: 'To nie zmienia miesiecznego przychodu projektu. Tygodnie pomagaja sprawdzic wykonalnosc i rozklad godzin.',
      },
    ],
  },
  {
    id: 'tile-scale',
    title: 'Tryb kafelkow',
    summary: 'Wyjasnia jeden przelacznik Godziny/Koszt na kafelkach Diablo.',
    tags: ['kafelki', 'koszt', 'godziny', 'widok'],
    sections: [
      {
        heading: 'Co zmienia tryb?',
        body: 'Przelacznik zmienia tylko widoczna metryke na kafelkach Diablo: Godziny pokazuje naklad pracy, a Koszt pokazuje wewnetrzny koszt osoby dla tego slotu.',
      },
      {
        heading: 'Czego nie zmienia?',
        body: 'Nie zmienia danych alokacji, budzetu projektu, ukladu ramek ani atomu drag/drop. Pojedynczy kafelek nadal reprezentuje podstawowy atom capacity/revenue.',
      },
      {
        heading: 'Dlaczego nie ma skali 1k/2k/5k?',
        body: 'Skala planszy i osobny kontekst godzin zostaly usuniete z narzedziownika, bo tworzyly niejasne opisy. Diablo zostaje przy prostym wyborze Godziny/Koszt.',
      },
    ],
  },
];

export const helpTopicsById = new Map(helpTopics.map((topic) => [topic.id, topic]));
