const readline = require('readline') // lets user interact via console.
const userInterface = readline.createInterface({input: process.stdin});

class Character {
  constructor({name, icon, hp, energy, hand, deck}){
    this.name = name;
    this.icon = icon;
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
    this.drawHand();
  }
  static display (character) {
    console.log(`  ${character.icon} ${character.name} ${character.hp}❤️  ${character.block?character.block+"🛡":""} ${character.strength?character.strength+"💪":""} ${character.poison?character.poison+"☣️":""} ${character===this?repeat("⚡️", character.energy):""}${character instanceof Monster ? character.hand[0].name :""}`);
  }
  async act(){}
  upkeep(){
    this.block = 0;
    if (this.poison > 0){   //poison effects
      console.log(`${this.name} took ${this.poison} damage from poison.`);
      this.takeDamage(this.poison);
      this.poison -= 1;
    }
    this.energy = this.maxEnergy;
  }
  takeDamage(damage){
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
    else throw new Error(`Unknown status: ${status}`);
  }
  die(){
    console.log(this.name, "died!");
    if (this instanceof Hero) {
      const indexInHeroes = this.room.heroes.indexOf(this);
      this.room.heroes.splice(indexInHeroes, 1); // remove 1 item from list.
    } else { // instanceof Monster
      const indexInMonsters = this.room.monsters.indexOf(this);
      this.room.monsters.splice(indexInMonsters, 1); // remove 1 item from list.
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
  async act(){
    this.upkeep();
    while (this.energy && this.hp > 0) {
      console.log("Hand:");
      this.hand.forEach((card) => Card.display(card, this));
      console.log("Heroes:");
      this.room.heroes.forEach(Character.display.bind(this)); // show hero energy
      console.log("Monsters:");
      this.room.monsters.forEach(Character.display);
      console.log("Enter a card to play and a target.");
      const answer = await prompt("ex: shield self, strike zombie, end.");
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
          card.play(this, target);
          this.discard(card);
          this.energy -= card.cost;
        } else console.log("Not enough energy.");
      } catch (error) {
        console.log("Invalid input. Try again", error);
      }
    }
    console.log(this.name, "ends its turn.");
    this.discardHand();
  }
};
class Monster extends Character {  // can only play one card per turn despite AP.
  async act(){
    this.upkeep();
    while (this.energy && this.hp > 0) {
      const card = this.hand.filter(card => card.cost <= this.energy)[0];
      if (!card) break; // maybe can't play any cards.
      this.energy -= card.cost;
      if (card instanceof Attack) {
        const randomEnemy = this.room.heroes[randInRange(0, this.room.heroes.length)];
        card.play(this, randomEnemy);
      } else { // instanceof Skill
        card.play(this, this);
      }
    }
    console.log(this.name, "ends its turn.");
    this.discardHand();
  }
};
// Monsters
class Sneko extends Monster {
  constructor () {
    super({
      name: "Sneko",
      icon: "🐍 ",
      hp: randInRange(7, 15),
      energy: 1,
      hand: 1,
      deck: [new Strike(), new Poison()]
    });
  }
};
class Zombie extends Monster {
  constructor(){
    super({
      name: "Zombie",
      icon: "🧟‍♂️ ",
      hp: randInRange(7, 15),
      energy: 2,
      hand: 2,
      deck: [new Shield(), new Strike(), new Flex()]
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
      deck: [new Bandage(), new Strike()]
    });
  }
};

class Card {
  static display (card, caster) {
    console.log(`  ${card.icon} ${card.cost}⚡️ ${card.name}: ${card.makeText(caster)}`);
  }
  static shuffle (cards) {
    let remaining = cards.length+1;
    while(remaining--)cards.push(cards.splice(randInRange(0,remaining),1)[0]);
  }
  play(caster, target){
    this.announce(caster, target);
    this.effect(caster, target);
  }
  effect(caster, target){} // actually does the effect, like takeDamage or gainStatus.
  announce(caster, target){
    console.log(`${caster.name} used ${this.name} on ${caster === target ? "itself" : target.name}!`);
  }
};
class Attack extends Card {};
class Skill extends Card {};
// Cards:
class Strike extends Attack {
  constructor () {
    super();
    this.name = "Strike";
    this.icon = "⚔️ "
    this.cost = 1;
    this.makeText = (caster) => `Deal ${6 + caster.strength} damage.`;
  }
  effect(caster, target) {
    target.takeDamage(6 + caster.strength);
  }
};
class Flex extends Skill {
  constructor () {
    super();
    this.name = "Flex";
    this.icon = "💪"
    this.cost = 1;
    this.makeText = (caster) => "Gain 1 permanent strength.";
  }
  effect(caster, target) {
    target.gainStatus("strength", 1);
  }
};
class Poison extends Attack {
  constructor () {
    super();
    this.name = "Poison";
    this.icon = "☣️ "
    this.cost = 1;
    this.makeText = (caster) => "Apply 5 poison.";
  }
  effect(caster, target) {
    target.gainStatus("poison", 5);
  }
};
class Shield extends Skill {
  constructor () {
    super();
    this.name = "Shield";
    this.icon = "🛡 ";
    this.cost = 1;
    this.makeText = (caster) => "Gain 5 block.";
  }
  effect(caster, target) {
    caster.gainStatus("block", 5);
  }
};
class Bandage extends Skill {
  constructor () {
    super();
    this.name = "First Aid";
    this.icon = "💉"
    this.cost = 2;
    this.makeText = (caster) => "Heal 2 hp.";
  }
  effect(caster, target) {
    caster.takeDamage(-2);
  }
};

(async function runGame () {
  const room = {
    heroes: [new Hero({
      name: "Hero",
      icon: "🦸‍♂️ ",
      hp: randInRange(45, 45),
      energy: 3,
      hand: 3,
      deck: [new Strike(), new Strike(), new Shield(), new Shield(), new Bandage(), new Poison(), new Flex()]
    })],
    monsters: [new Sneko(), new Zombie(), new Cultist()]
  };
  [...room.heroes, ...room.monsters].forEach(c => c.room = room);
  let activeIndex = 0;
  while (room.heroes.length > 0 && room.monsters.length > 0) {
    let activeCharacter = [...room.heroes, ...room.monsters][activeIndex];
    await activeCharacter.act();
    activeIndex = (activeIndex + 1) % (room.heroes.length + room.monsters.length); // wrap around thru 0.
  }
  console.log(room.heroes.length > 0 ? "Room cleared!" : "Game over!");
  process.exit(); // force program to quit
})();

// Utility Functions:
async function prompt (question) {
  console.log(question);
  return new Promise(resolve => userInterface.question(question, resolve));
}
function randInRange (from, to) {
  return from + Math.floor(Math.random() * (to - from));
}
function repeat(icon, count) {
  return Array(count).fill(icon).join("");
}

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
