ALTER TABLE agents
  ADD COLUMN gender TEXT DEFAULT 'non-binary'
    CHECK (gender IN ('masculine', 'feminine', 'androgynous', 'non-binary', 'fluid', 'agender', 'void')),
  ADD COLUMN seeking TEXT[] DEFAULT '{any}';
