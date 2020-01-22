const WEAK_DEBUFF = .75;

class Game {
  constructor({quit, message, getUserInput, render}){
    this.quit = quit.bind(this);
    this.message = message.bind(this);
    this.getUserInput = getUserInput.bind(this);
    this.render = render.bind(this);
    this.activeIndex = 0;
    this.room = {
      heroes: [new Hero({
        name: "Ironclad",
        icon: "🦸‍♂️ ",
        hp: randInRange(45, 45),
        energy: 3,
        hand: 3,
        deck: [new Cleave(), new TwinStrike(), new Defend(), new Defend(), new BandageUp(), new DeadlyPoison(), new Flex(), new Intimidate()],
        imageUrl: "https://vignette.wikia.nocookie.net/slay-the-spire/images/7/70/Ironclad.png/revision/latest?cb=20181020082717",
      })],
      monsters: [new Snecko(), new JawWorm(), new Cultist()]
    };
    this.run();
  }
  quit(){ /* implemented by constructor */ }
  message(stringOrError){ /* implemented by constructor */ }
  async getUserInput(){ /* implemented by constructor */ }
  async render(room=this.room){ /* implemented by constructor */ }
  async run(){
    [...this.room.heroes, ...this.room.monsters].forEach(c => c.room = this.room);
    while (this.room.heroes.length > 0 && this.room.monsters.length > 0) {
      const activeCharacter = [...this.room.heroes, ...this.room.monsters][this.activeIndex];
      await activeCharacter.act(this);
      this.activeIndex = (this.activeIndex + 1) % (this.room.heroes.length + this.room.monsters.length); // wrap around thru 0.
    }
    await this.render();
    this.message(this.room.heroes.length > 0 ? "Room cleared; you won!" : new Error("You died; game over!"));
    this.quit();
  }
}

class Character {
  constructor({name, icon, hp, energy, hand, deck, imageUrl}){
    this.name = name;
    this.icon = icon;
    this.imageUrl = imageUrl;
    this.maxHp = hp;
    this.hp = hp;
    this.maxEnergy = energy
    this.energy = energy;
    this.deck = []; // start all cards in discarded to shuffle them.
    this.drawCount = hand;
    this.hand = [];
    this.discarded = deck;
    this.block = 0;
    this.poison = 0;
    this.strength = 0;
    this.weak = 0;
    this.drawHand();
  }
  async act({message, getUserInput, render}){ /* implemented by subclasses */ }
  upkeep(game){
    this.block = 0;
    if (this.poison > 0){   //poison effects
      game.message(`${this.name} took ${this.poison} damage from poison.`);
      this.takeDamage(this.poison);
      this.poison -= 1;
    }
    this.energy = this.maxEnergy;
  }
  cleanUp(game){
    this.weak = this.weak ? (this.weak - 1) : 0;
    game.message(this.name + " ends its turn.");
    this.discardHand();
  }
  takeDamage(damage){
    damage = Math.round(damage);
    if (damage < 0) return this.hp -= damage; // can be negative to heal
    if (this.block >= damage) {
      this.block -= damage;
      damage = 0;
    } else { // block < damage
      damage -= this.block;
      this.block = 0;
      this.hp -= damage;
      if (this.hp <= 0) this.die();
    }
  }
  gainStatus(status, amount){ // can be buffs or nerfs
    if (status === "block") this.block += amount;
    else if (status === "poison") this.poison += amount;
    else if (status === "strength") this.strength += amount;
    else if (status === "weak") this.weak += amount;
    else throw new Error(`Unknown status: ${status}`);
  }
  die(){
    console.log(this.name + " died!");
    if (this instanceof Hero) {
      const indexInHeroes = this.room.heroes.indexOf(this);
      if (indexInHeroes !== -1) this.room.heroes.splice(indexInHeroes, 1); // remove 1 item from list.
    } else { // instanceof Monster
      const indexInMonsters = this.room.monsters.indexOf(this);
      if (indexInMonsters !== -1) this.room.monsters.splice(indexInMonsters, 1); // remove 1 item from list.
    }
  }
  discard(cardToDiscard){
    this.hand = this.hand.filter(card => card !== cardToDiscard);
    this.discarded.push(cardToDiscard);
  }
  discardHand(){
    while (this.hand.length) {
      this.discarded.push(this.hand.pop());
    }
    this.drawHand();
  }
  drawHand() {
    let numCards = this.drawCount;
    while (numCards > 0) {
      if (this.deck.length === 0) this.shuffleDiscardedIntoDeck();
      this.hand.push(this.deck.pop());
      numCards--;
    }
  }
  shuffleDiscardedIntoDeck(){
    Card.shuffle(this.discarded);
    this.deck.push(this.discarded.pop());
  }
};
class Hero extends Character {
  async act(game){
    this.upkeep(game);
    while (this.energy && this.hp > 0) {
      await game.render();
      const answer = await game.getUserInput();
      if (answer === "🔚" || answer.toLowerCase() === "end") break;
      try {
        const card = this.hand.filter(x => answer.includes(x.icon.trim()))[0]
          || this.hand.filter(x => answer.toLowerCase().includes(x.name.toLowerCase()))[0];
        let target;
        if (answer.toLowerCase().includes("self") || answer.toLowerCase().includes("me")) target = this;
        else target = [...this.room.heroes, ...this.room.monsters].filter(x => answer.includes(x.icon.trim()))[0]
          || [...this.room.heroes, ...this.room.monsters].filter(x => answer.toLowerCase().includes(x.name.toLowerCase()))[0];
        if (card.cost <= this.energy) {
          console.clear();
          card.play(this, target, game);
          this.discard(card);
          this.energy -= card.cost;
        } else game.message(new Error("Not enough energy."));
      } catch (error) {
        game.message(new Error("Invalid input. Try again. " + error));
      }
      if (this.room.monsters.length === 0) break; // already won!
    }
    this.cleanUp(game);
  }
};
class Monster extends Character {  // can only play one card per turn despite AP.
  async act(game){
    this.upkeep(game);
    while (this.energy && this.hp > 0) {
      const card = this.hand.filter(card => card.cost <= this.energy)[0];
      if (!card) break; // maybe can't play any cards.
      this.energy -= card.cost;
      if (card instanceof Attack) {
        const randomEnemy = this.room.heroes[randInRange(0, this.room.heroes.length)];
        if (!randomEnemy) break; // already won!
        card.play(this, randomEnemy, game);
      } else { // instanceof Skill
        card.play(this, this, game);
      }
    }
    this.cleanUp(game);
  }
};
// Monsters
class Snecko extends Monster {
  constructor () {
    super({
      name: "Snecko",
      icon: "🐍 ",
      hp: randInRange(7, 15),
      energy: 1,
      hand: 1,
      deck: [new Defend(), new DeadlyPoison()],
      imageUrl: "https://vignette.wikia.nocookie.net/slay-the-spire/images/4/44/Snecko.png/revision/latest?cb=20180916025017",
    });
  }
};
class JawWorm extends Monster {
  constructor(){
    super({
      name: "Jaw Worm",
      icon: "🐗 ",
      hp: randInRange(7, 15),
      energy: 2,
      hand: 2,
      deck: [new Strike(), new Flex()],
      imageUrl: "https://vignette.wikia.nocookie.net/slay-the-spire/images/d/d5/Jaw-worm-pretty.png/revision/latest?cb=20180110063613",
    });
  }
};
class Cultist extends Monster {
  constructor(){
    super({
      name: "Cultist",
      icon: "🧙‍♂️ ",
      hp: randInRange(7, 15),
      energy: 2,
      hand: 2,
      deck: [new BandageUp(), new Strike()],
      imageUrl: "https://vignette.wikia.nocookie.net/slay-the-spire/images/c/c6/Cultist-pretty.png/revision/latest?cb=20180106102518",
    });
  }
};

class Card {
  static shuffle (cards) {
    let remaining = cards.length+1;
    while(remaining--)cards.push(cards.splice(randInRange(0,remaining),1)[0]);
  }
  play(caster, target, game){
    this.announce(caster, target, game);
    this.effect(caster, target);
  }
  effect(caster, target){} // actually does the effect, like takeDamage or gainStatus.
  announce(caster, target, game){
    game.message(`${caster.name} used ${this.name} on ${caster === target ? "itself" : target.name}!`);
  }
};
class Attack extends Card {};
class Skill extends Card {};
// Cards:
class Strike extends Attack {
  name = "Strike"
  icon = "🗡️ "
  cost = 1
  imageUrl = "https://vignette.wikia.nocookie.net/slay-the-spire/images/0/06/Strike_R.png/revision/latest?cb=20181016211045"
  makeText(caster) {
    return `Deal ${(caster.weak ? WEAK_DEBUFF : 1) * (6 + caster.strength)} damage.`
  }
  effect(caster, target) {
    target.takeDamage((caster.weak ? WEAK_DEBUFF : 1) * (6 + caster.strength));
  }
};
class TwinStrike extends Attack {
  name = "Twin Strike"
  icon = "⚔️ "
  cost = 1
  imageUrl = "https://vignette.wikia.nocookie.net/slay-the-spire/images/1/18/TwinStrike.png/revision/latest/scale-to-width-down/310?cb=20181016211122"
  makeText(caster) {
    return `Deal ${(caster.weak ? WEAK_DEBUFF : 1) * (5 + caster.strength)} damage twice.`;
  }
  effect(caster, target) {
    target.takeDamage((caster.weak ? WEAK_DEBUFF : 1) * (5 + caster.strength));
    target.takeDamage((caster.weak ? WEAK_DEBUFF : 1) * (5 + caster.strength));
  }
};
class Cleave extends Attack {
  name = "Cleave"
  icon = "💫 "
  cost = 1
  imageUrl = "https://vignette.wikia.nocookie.net/slay-the-spire/images/c/c8/Cleave.png/revision/latest/scale-to-width-down/310?cb=20181016205731"
  makeText(caster) {
    return `Deal ${(caster.weak ? WEAK_DEBUFF : 1) * (8 + caster.strength)} damage to all enemies.`;
  }
  effect(caster, target) {
    if (target instanceof Monster) {
      target.room.monsters.forEach((currentMonster, index, arrayOfMonsters)=>{
        currentMonster.takeDamage((caster.weak ? WEAK_DEBUFF : 1) * (8 + caster.strength));
      });
    }else {
      target.room.heroes.forEach((currentHero, index, arrayOfHeroes)=>{
        currentHero.takeDamage((caster.weak ? WEAK_DEBUFF : 1) * (8 + caster.strength));
      });
    }
  }
};
class Intimidate extends Skill {
  name = "Intimidate"
  icon = "😱"
  cost = 0
  imageUrl = "https://vignette.wikia.nocookie.net/slay-the-spire/images/7/72/Intimidate.png/revision/latest/scale-to-width-down/310?cb=20181016210817"
  makeText(caster) {
    return "apply 1 weak to all enemies.";
  }
  effect(caster, target) {
    if (target instanceof Monster) {
      target.room.monsters.forEach((currentMonster, index, arrayOfMonsters)=>{
        currentMonster.gainStatus("weak", 1);
      });
    }else {
      target.room.heroes.forEach((currentHero, index, arrayOfHeroes)=>{
        currentHero.gainStatus("weak", 1);
      });
    }
  }
}
class Flex extends Skill {
  name = "Flex"
  icon = "💪"
  cost = 1
  imageUrl = "https://vignette.wikia.nocookie.net/slay-the-spire/images/5/5a/Flex.png/revision/latest?cb=20181016205957"
  makeText(caster) {
    return "Gain 1 permanent strength.";
  }
  effect(caster, target) {
    target.gainStatus("strength", 1);
  }
}
class DeadlyPoison extends Attack {
  name = "Deadly Poison"
  icon = "🤢"
  cost = 1
  imageUrl = "https://vignette.wikia.nocookie.net/slay-the-spire/images/b/b7/DeadlyPoison.png/revision/latest?cb=20181016211437"
  makeText(caster) {
    return "Apply 5 poison.";
  }
  effect(caster, target) {
    target.gainStatus("poison", 5);
  }
}
class Defend extends Skill {
  name = "Defend"
  icon = "🛡 "
  cost = 1
  imageUrl = "https://vignette.wikia.nocookie.net/slay-the-spire/images/7/7d/Defend_R.png/revision/latest?cb=20181016205732"
  makeText(caster) {
    return "Gain 5 block.";
  }
  effect(caster, target) {
    caster.gainStatus("block", 5);
  }
}
class BandageUp extends Skill {
  name = "Bandage Up"
  icon = "💉"
  cost = 2
  imageUrl = "https://vignette.wikia.nocookie.net/slay-the-spire/images/4/4e/BandageUp.png/revision/latest?cb=20181016212248"
  makeText(caster) {
    return "Heal 2 hp.";
  }
  effect(caster, target) {
    caster.takeDamage(-2);
  }
};

if (typeof window === "undefined") { // Node
  const userInterface = require('readline').createInterface({input: process.stdin});

  new Game({
    quit: process.exit,
    message,
    async getUserInput() {
      console.log("Enter a card to play and a target.");
      const question = "ex: shield self, strike zombie, end.";
      console.log(question);
      return new Promise(resolve => userInterface.question(question, resolve));
    },
    async render(room=this.room){
      const hero = room.heroes[0];
      message("Hand:");
      hero.hand.forEach((card) => displayCard(card, hero));
      message("Heroes:");
      room.heroes.forEach(displayCharacter.bind(hero)); // show hero energy
      message("Monsters:");
      room.monsters.forEach(displayCharacter);
    }
  });

  function message(stringOrError) {
    stringOrError instanceof Error // https://stackoverflow.com/a/41407246/1862046
      ? console.error("\x1b[31m%s\x1b[0m",stringOrError) // makes text red
      : console.info(stringOrError);
  };

  function displayCard(card, caster) {
    message(`  ${card.icon} ${card.cost}⚡️ ${card.name}: ${card.makeText(caster)}`);
  };

  function displayCharacter (character) {
    message(`  ${character.icon} ${character.name} ${character.hp}❤️  ${character.block?character.block+"🛡  ":""}${character.strength?character.strength+"💪 ":""}${character.weak?character.weak+"☮️ ":""}${character.poison?character.poison+"🤢 ":""}${character===this?repeat("⚡️", character.energy):""}${character instanceof Monster ? character.hand[0].name :""}`);
  };

  function repeat(icon, count) {
    return Array(count).fill(icon).join("");
  };
}

// Utility Functions:

function randInRange (from, to) {
  return from + Math.floor(Math.random() * (to - from));
};

/*
// class Game {
//   money
//   map
//   room
//   player
//   start(){
//     // player selects starting deck (AKA character)
//     this.maps = [new Map(1), new Map(2), new Map(3)]
//   }
//   loop(){
//       player selects a room
//       room opens
//       player completes the room
//   }
// }

// class Map {
//   level // 1 2 3 or endless
//   floors
//   advance(room){
//     move player to room
//     Game.room = room
//     room.open()
//   }
// }

// class Room {
//   // icon
//   // background
//   open(){} // activates
// }
// class Shop extends Room {}
// class Battle extends Room {}
// class Mystery extends Room {
//   text
//   choices
//   choose(option){}
// }
*/
