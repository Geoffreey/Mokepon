BEGIN;
ALTER TABLE casino_plays DROP CONSTRAINT casino_plays_game_check;
ALTER TABLE casino_plays ADD CONSTRAINT casino_plays_game_check CHECK (game IN ('dados-ajaw','sol-luna','rueda-maya','cartas-mayab'));
ALTER TABLE casino_plays DROP CONSTRAINT casino_plays_choice_check;
ALTER TABLE casino_plays ADD CONSTRAINT casino_plays_choice_check CHECK (choice IN ('bajo','siete','alto','sol','luna','giro','duelo'));
COMMIT;
