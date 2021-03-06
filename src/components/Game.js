import React, { Component } from 'react';
import { connect } from 'react-redux'; //used to take data from redux store and map to props
import { SERVER } from '../constants/envConstants';
import axios from 'axios';
import Popup from 'reactjs-popup';
import { socket } from '../socket/socket';
import { Card } from './Card/Card';
import { DECK_NUM, PINGS } from '../constants/constants';
import ChatBox from './ChatBox/ChatBox';
import { calcCard } from '../utils/calcCard';
import RLDD from 'react-list-drag-and-drop/lib/RLDD';
import Sound from 'react-sound';

import {
    Container, 
    Button,
    Row,
    Col,
    Form,
    InputGroup
} from 'react-bootstrap';



import '../App.css';


class Game extends Component {
    state = {
        swapPhase : true,
        everyoneSwapped : false,
        showSwapButtons : true,
        selectedHandCards : [],
        selectedUntouchedCards : [],
        numReset : 0,
        gameEnded : false,

        //States that control the center
        haveToTakeCenter : false,
        drawCardOpps : 0,

        //State for play again
        newGameID : "",
        waitingForNewGame : false,

        //State to play notif sound
        playSound : false,
        playPingSound : false,
        ping: "k-bababooey.wav",
        muted : false,

        showHiddenCardMsg : false,
        popUp : false,
        popUpMsg : ""
    }

    closePopUp = (event) => {
        this.setState({ popUp : false, popUpMsg: "" });
    }

    cardPlayHandler = (card, fromUntouched) => {
        console.log(card, fromUntouched);
        this.setState({playSound : false}); //off bc of activity
        if (this.state.gameEnded) {
            this.displayGameEndedMessage();
            return;
        }
        //Prevent the player from playing another card after having played a hidden card.
        if (this.state.haveToTakeCenter) {
            this.setState({
                popUpMsg : "You cannot play another other card! Take from the center to end your turn.",
                popUp : true
            });
            return;
        }

        //For the swapping phase
        if (!this.state.everyoneSwapped) {
            if (fromUntouched) {
                if (this.state.selectedUntouchedCards.indexOf(card) !== -1) {
                    this.setState({selectedUntouchedCards : this.state.selectedUntouchedCards.filter(item => item !== card)});
                } else {
                    this.setState({selectedUntouchedCards : [...this.state.selectedUntouchedCards, card]});
                }
            } else {
                if (this.state.selectedHandCards.indexOf(card) !== -1) {
                    this.setState({selectedHandCards : this.state.selectedHandCards.filter(item => item !== card)});
                } else {
                    this.setState({selectedHandCards : [...this.state.selectedHandCards, card]});
                }
            }

        //For after the swapping phase ends (playing cards)
        } else if (this.props.turn_at === this.props.username) {
            if (fromUntouched && (this.props.deck !== 0 || this.props.hand.length !== 0)) {
                this.setState({
                    popUpMsg : "This card can only be played once the deck runs out and you have no cards in your hand.",
                    popUp : true
                });
            } else if (this.props.playable_cards === undefined) {
                alert("Warning: playable cards is undefined");
            } else if (this.props.playable_cards.indexOf(card) === -1) {
                this.setState({
                    popUpMsg : "This card cannot beat the card in the center.",
                    popUp : true
                });
            } else {
                axios.put(SERVER('game/' + this.props.game_id + '/playCard'), {
                    user_id : this.props.user_id,
                    card_played : card,
                    from_untouched : fromUntouched
                }).then((res) => {
                    if (!res.data.success) {
                        this.setState({
                            popUpMsg : res.data.err_msg,
                            popUp : true
                        });
                        //if the room data has been deleted, prompt inactivty message
                        if (res.data.err_msg === "Room does not exist!") {
                            this.displayInactivityMessage();
                            socket.emit('data-lost', {"game_id" : this.props.game_id});
                        }
                    } else {
                        if (fromUntouched) {
                            this.props.updateUntouchedHand(this.props.untouched_hand.map((item) => {return (item === card) ? -1 : item }));
                        } else {
                            this.props.updateHand(this.props.hand.filter(item => item !== card));
                        }
                        this.props.updateCenter({
                            deck : this.props.deck,
                            played_pile : [...this.props.played_pile, card],
                            discard_pile : this.props.discard_pile
                        });

                        //Update the chat
                        this.props.updateMessages([...this.props.messages, {username : "", message : this.props.username + " played a " + calcCard(card) + "!"}]);

                        if (res.data.go_again) {
                            if (res.data.is_burn) { 
                                this.setState({
                                    popUpMsg : "You burned the play pile! You can play another card! Remember to draw a card for every card you play!",
                                    popUp : true
                                });
                                this.props.updateMessages([...this.props.messages, {username : "", message : "The play pile was burned!"}]);
                                this.props.updateCenter({
                                    deck : this.props.deck,
                                    played_pile : [],
                                    discard_pile : [...this.props.discard_pile, ...this.props.played_pile]
                                });
                            } else {
                                this.setState({
                                    popUpMsg : "You can play another card! Remember to draw a card for every card you play!",
                                    popUp : true
                                });
                            }
                            //Update the playable cards because the next card can be anything
                            this.props.updatePlayableCards(DECK_NUM);
                        } else {
                            //If the player doesn't go again, move turn pointer to next player
                            let index = this.props.player_names.indexOf(this.props.username);
                            this.props.updateTurnAt(index === this.props.player_names.length - 1 ? this.props.player_names[0] : this.props.player_names[index + 1]);
                        }

                        if (!this.props.settings.autoDraw && !this.state.popUp && this.props.hand.length <= 1 && this.props.deck > 0) {
                            this.setState({
                                popUpMsg : "Remember to draw a card for every card you play!",
                                popUp : true
                            });
                        }
                        

                        //Update the card draw opps so the player can draw a card
                        if (this.props.hand.length < 4) {
                            this.setState({drawCardOpps : 4 - this.props.hand.length});
                        }

                        
                        //Check to see if the player has reach their hidden cards
                        if (this.props.hand.length === 0 && this.props.deck === 0 && 
                            this.props.untouched_hand[0] === -1 && this.props.untouched_hand[1] === -1 &&
                            this.props.untouched_hand[2] === -1) {


                            //Check to see if the player has won
                            if (this.props.hidden_hand.indexOf(false) === -1) {
                                this.displayWinMessage(this.props.username);
                                this.setState({gameEnded : true});
                            }

                            if (!this.state.showHiddenCardMsg) {
                                this.setState({
                                    showHiddenCardMsg : true,
                                    popUpMsg : "You have reached your last 3 cards! These are face-down, hidden cards. On your turn, you need to select one to play at random. If the card doesn't beat the center, you must take the center cards.",
                                    popUp : true
                                });
                            }
                            
                        }
                        //Notify other players of your turn
                        socket.emit('play-card', {"game_id" : this.props.game_id, "card" : card, "username" : this.props.username, "playable" : true, "is_burn" : res.data.is_burn});

                        //Autodraw cards for the player if auto draw is turned on
                        if (this.props.settings.autoDraw) {
                            let numDraw = Math.min(4 - this.props.hand.length, this.props.deck);
                            while (numDraw > 0) {
                                this.deckClickHandler();
                                numDraw--;
                            }
                        }
                        
                    }
                });
            }
        } else {
            this.setState({
                popUpMsg : `It is not your turn! (It's ${this.props.turn_at}'s turn)`,
                popUp : true
            });
        }
    }

    multipleCardPlayHandler = () => {
        this.setState({playSound : false}); //off bc of activity
        if (this.state.gameEnded) {
            this.displayGameEndedMessage();
        } else if (!this.state.everyoneSwapped) {
            this.setState({
                popUpMsg : "The swapping phase hasn't ended yet!",
                popUp : true
            });
        } else if (this.props.turn_at !== this.props.username) {
            this.setState({
                popUpMsg : `It is not your turn! (It's ${this.props.turn_at}'s turn)`,
                popUp : true
            });
        } else if (this.props.hand.length < 4 && this.props.deck === 0 && 
                   (this.props.untouched_hand[0] !== -1 || this.props.untouched_hand[1] !== -1 || this.props.untouched_hand[2] !== -1)) {
            
            if (this.props.hand.length === 0) {
                this.setState({
                    popUpMsg : "You have no more cards in your hand.",
                    popUp : true
                });
            }
            
            this.setState({selectedHandCards : []});
            this.setState({selectedUntouchedCards : []});
            let handDisplay = this.props.hand.map((card) => {
                return (<Card highlight={true} clickable={true} float={true} playCard={() => {this.selectCardHandler(card, false)}} fromUntouched={false} key={card} number={card}/>);
            });
            let untouchedHandDisplay = this.props.untouched_hand.map((card, index) => {
                if (card === -1) {
                    return (<Card clickable={false} highlight={false} float={true} blank={true} key={index}/>);
                }
                return (<Card highlight={true} clickable={true} float={true} playCard={() => {this.selectCardHandler(card, true)}} fromUntouched={true} key={card} number={card}/>);
            });
            this.setState({
                popUpMsg : (
                    <Container>
                        <Row><Col><div className="center-div">Select the cards that you want to play together as a combo (must be of same number).</div></Col></Row>
                        <Row><hr></hr></Row>
                        <Row className="justify-content-md-center">
                            <Col xs><div className="float-right">Center Face-Up Cards: </div></Col>
                            <Col>{untouchedHandDisplay}</Col>
                            <Col xs></Col>
                        </Row>
                        <Row><hr></hr></Row>
                        <Row className="justify-content-md-center">
                            <Col xs><div className="float-right">Hand Cards: </div></Col>
                            <Col>{this.props.hand.length === 0 ? (<div className="float-left">None</div>) : handDisplay}</Col>
                            <Col xs></Col>
                        </Row>
                        <Row><hr></hr></Row>
                        <Row><Col><div className="center-div"><Button className="play-mult-btn" onClick={this.multipleCardPlayHandlerHelper} variant="outline-secondary" size="sm">Play These Cards</Button></div></Col></Row>
                    </Container>
                ),
                popUp : true
            });
        } else {
            this.setState({selectedHandCards : []});
            this.setState({selectedUntouchedCards : []});
            let handDisplay = this.props.hand.map((card) => {
                return (<Card highlight={true} clickable={true} float={true} playCard={() => {this.selectCardHandler(card, false)}} fromUntouched={false} key={card} number={card}/>)
            });
    
            this.setState({
                popUpMsg : (
                    <Container>
                        <Row><Col><div className="center-div">Select the cards that you want to play together as a combo (must be of same number).</div></Col></Row>
                        <Row><hr></hr></Row>
                        <Row className="justify-content-md-center">
                            {handDisplay.length > 12 ? null : (<Col xs></Col>)}
                            <Col>{handDisplay}</Col>
                            {handDisplay.length > 12 ? null : (<Col xs></Col>)}
                        </Row>
                        <Row><hr></hr></Row>
                        <Row><Col><div className="center-div"><Button className="play-mult-btn" onClick={this.multipleCardPlayHandlerHelper} variant="outline-secondary" size="sm">Play These Cards</Button></div></Col></Row>
                    </Container>
                ),
                popUp : true
            });
        }
    }

    multipleCardPlayHandlerHelper = () => {
        this.setState({popUpMsg : "", popUp : false});
        if (this.state.selectedHandCards.length === 0 && this.state.selectedUntouchedCards.length === 0) {
            return;
        }

        let totalSelected = [...this.state.selectedHandCards, ...this.state.selectedUntouchedCards];

        //Check if the selected cards all have the same number
        let firstCard = totalSelected[0] % 13;
        for (let card of totalSelected) {
            if (card % 13 !== firstCard) {
                this.setState({
                    popUpMsg : "The cards selected are not the same number. Only duplicates can be played if you want to play multiple cards in a turn.",
                    popUp : true
                });
                return;
            }
        }

        //Check if the cards can beat the center
        if (this.props.playable_cards.indexOf(totalSelected[0]) === -1) {
            this.setState({
                popUpMsg : "The selected cards cannot beat the card in the center.",
                popUp : true
            });
            return;
        }

        //If untouched cards were selected, check if all of the hand cards are selected
        if (this.state.selectedUntouchedCards.length > 0 && this.state.selectedHandCards.length !== this.props.hand.length) {
            this.setState({
                popUpMsg : "You can only select the center face-up cards in your combo if all cards in your hand are also selected.",
                popUp : true
            });
            return;
        }

        axios.put(SERVER('game/' + this.props.game_id + '/playMultipleCards'), {
            user_id : this.props.user_id,
            selected_cards : totalSelected
        }).then((res) => {
            if (!res.data.success) {
                this.setState({
                    popUpMsg : res.data.err_msg,
                    popUp : true
                });
                //if the room data has been deleted, prompt inactivty message
                if (res.data.err_msg === "Room does not exist!") {
                    this.displayInactivityMessage();
                    socket.emit('data-lost', {"game_id" : this.props.game_id});
                }
            } else {
                this.props.updateHand(this.props.hand.filter(item => this.state.selectedHandCards.indexOf(item) === -1));
                this.props.updateUntouchedHand(this.props.untouched_hand.map((card) => {
                    if (this.state.selectedUntouchedCards.indexOf(card) !== -1) {
                        return -1;
                    } else {
                        return card;
                    }
                }));
                this.props.updateCenter({
                    deck : this.props.deck,
                    played_pile : [...this.props.played_pile, ...totalSelected],
                    discard_pile : this.props.discard_pile
                });

                //Update the chat
                for (let card of totalSelected) {
                    this.props.updateMessages([...this.props.messages, {username : "", message : this.props.username + " played a " + calcCard(card) + "!"}]);
                }

                if (res.data.go_again) {
                    if (res.data.is_burn) { 
                        this.setState({
                            popUpMsg : "You burned the play pile! You can play another card! Remember to draw a card for every card you play!",
                            popUp : true
                        });
                        this.props.updateMessages([...this.props.messages, {username : "", message : "The play pile was burned!"}]);
                        this.props.updateCenter({
                            deck : this.props.deck,
                            played_pile : [],
                            discard_pile : [...this.props.discard_pile, ...this.props.played_pile]
                        });
                    } else {
                        this.setState({
                            popUpMsg : "You can play another card! Remember to draw a card for every card you play!",
                            popUp : true
                        });
                    }
                    //Update the playable cards because the next card can be anything
                    this.props.updatePlayableCards(DECK_NUM);
                } else {
                    //If the player doesn't go again, move turn pointer to next player
                    let index = this.props.player_names.indexOf(this.props.username);
                    this.props.updateTurnAt(index === this.props.player_names.length - 1 ? this.props.player_names[0] : this.props.player_names[index + 1]);
                }

                if (!this.props.settings.autoDraw && !this.state.popUp && this.props.hand.length <= 1 && this.props.deck > 0) {
                    this.setState({
                        popUpMsg : "Remember to draw a card for every card you play!",
                        popUp : true
                    });
                }
                

                //Update the card draw opps so the player can draw a card
                if (this.props.hand.length < 4) {
                    this.setState({drawCardOpps : 4 - this.props.hand.length});
                }
                
                //Check to see if the player has reach their hidden cards
                if (this.props.hand.length === 0 && this.props.deck === 0 && 
                    this.props.untouched_hand[0] === -1 && this.props.untouched_hand[1] === -1 &&
                    this.props.untouched_hand[2] === -1) {


                    //Check to see if the player has won
                    if (this.props.hidden_hand.indexOf(false) === -1) {
                        this.displayWinMessage(this.props.username);
                        this.setState({gameEnded : true});
                    }

                    if (!this.state.showHiddenCardMsg) {
                        this.setState({
                            showHiddenCardMsg : true,
                            popUpMsg : "You have reached your last 3 cards! These are face-down, hidden cards. On your turn, you need to select one to play at random. If the card doesn't beat the center, you must take the center cards.",
                            popUp : true
                        });
                    }
                    
                }
                //Notify other players of your turn
                socket.emit('play-multiple', {"game_id" : this.props.game_id, "cards" : totalSelected, "username" : this.props.username, "is_burn" : res.data.is_burn});

                //Autodraw cards for the player if auto draw is turned on
                if (this.props.settings.autoDraw) {
                    let numDraw = Math.min(4 - this.props.hand.length, this.props.deck);
                    for (let i = 0; i < numDraw; i++) {
                        setTimeout(() => {
                            this.deckClickHandler();
                        }, 1000 * i);
                    }
                }
            }
        });

    }

    selectCardHandler = (card, fromUntouched) => {
        if (fromUntouched) {
            if (this.state.selectedUntouchedCards.indexOf(card) !== -1) {
                this.setState({selectedUntouchedCards : this.state.selectedUntouchedCards.filter(item => item !== card)});
            } else {
                this.setState({selectedUntouchedCards : [...this.state.selectedUntouchedCards, card]});
            }
        } else {
            if (this.state.selectedHandCards.indexOf(card) !== -1) {
                this.setState({selectedHandCards : this.state.selectedHandCards.filter(item => item !== card)});
            } else {
                this.setState({selectedHandCards : [...this.state.selectedHandCards, card]});
            }
        }
    }

    swapCardHandler = () => {
        console.log(this.state);
        if (this.state.selectedHandCards.length !== this.state.selectedUntouchedCards.length) {
            this.setState({
                popUpMsg : "You must choose the same number of face up cards in your hand and on the game board to swap.",
                popUp : true
            });
            this.resetSwapSelectionHandler();
        } else {
            axios.put(SERVER('game/' + this.props.game_id + '/swap'), {
                user_id : this.props.user_id,
                untouched : this.state.selectedUntouchedCards,
                hand : this.state.selectedHandCards
            }).then((res) => {
                if (!res.data.success) {
                    this.setState({
                        popUpMsg : res.data.err_msg,
                        popUp : true
                    });
                    if (res.data.err_msg === "Room does not exist!") {
                        this.displayInactivityMessage();
                        socket.emit('data-lost', {"game_id" : this.props.game_id});
                    }
                } else {
                    axios.get(SERVER('game/' + this.props.game_id + '/' + this.props.user_id + '/state')).then((subRes) => {
                        this.props.updateState({
                            players : subRes.data.other_players,
                            deck : subRes.data.draw_deck_size,
                            played_pile : subRes.data.played_pile,
                            discard_pile : subRes.data.discard_pile,
                            hand : subRes.data.hand,
                            untouched_hand : subRes.data.untouched_hand,
                            hidden_hand : subRes.data.hidden_hand,
                            playable_cards : subRes.data.playable_cards,
                            turn_at : subRes.data.turn_at
                        });
                        this.setState({selectedUntouchedCards : [], selectedHandCards : []});
                        //Notify the other players to update their views
                        socket.emit('swap', {"game_id" : this.props.game_id});
                    });   
                }
            });
        }
    }

    lockInHandler = () => {
        if (this.state.swapPhase) {
            axios.put(SERVER('game/' + this.props.game_id + '/ready'), {
                user_id : this.props.user_id
            }).then((res) => {
                if (!res.data.success) {
                    if (res.data.err_msg === "Room does not exist!") {
                        this.displayInactivityMessage();
                        socket.emit('data-lost', {"game_id" : this.props.game_id});
                    }
                } else {
                    axios.get(SERVER('game/' + this.props.game_id + '/' + this.props.user_id + '/state')).then((subRes) => {
                        this.props.updateGame({
                            players : subRes.data.other_players,
                            deck : subRes.data.draw_deck_size,
                            played_pile : subRes.data.played_pile,
                            discard_pile : subRes.data.discard_pile,
                            playable_cards : subRes.data.playable_cards,
                            turn_at : subRes.data.turn_at
                        });
                        this.props.updateMessages([...this.props.messages, {username : "", message : this.props.username + " has locked in their swaps!"}]);
                        this.setState({swapPhase : false});
                        if (res.data.everyone_ready) {
                            this.setState({everyoneSwapped : true});
                            this.props.updateMessages([...this.props.messages, {username : "", message : "Everyone is ready. Let the game start!"}]);
                            this.props.updateMessages([...this.props.messages, {username : "", message : "Follow the ☞ emoji next to players' names to see who's turn it is!"}]);
                            console.log(this.state);
                        }
                        //Notify other players
                        socket.emit('lock-in', {"game_id" : this.props.game_id, "username" : this.props.username});
                    }); 
                }
            });
        }
    }

    resetSwapSelectionHandler = () => {
        this.setState({
            selectedHandCards : [],
            selectedUntouchedCards : [],
            numReset : this.state.numReset + 1
        });
    }

    playHiddenHandler = (cardPosition) => {
        this.setState({playSound : false}); //off bc of activity
        //Prevent the player from playing another card after having played a hidden card.
        if (this.state.haveToTakeCenter) {
            this.setState({
                popUpMsg : "You cannot play another other card! Take from the center to end your turn.",
                popUp : true
            });
            return;
        }

        if (this.state.gameEnded) {
            this.displayGameEndedMessage();
            return;
        }

        //Check to see if the player has reach their hidden cards
        if (this.props.hand.length > 0 || this.props.deck > 0 ||
            this.props.untouched_hand[0] !== -1 || this.props.untouched_hand[1] !== -1 ||
            this.props.untouched_hand[2] !== -1) {

            this.setState({
                popUpMsg : "You cannot play your hidden cards yet!",
                popUp : true
            });
        } else {
            axios.put(SERVER('game/' + this.props.game_id + '/playHidden'), {
                user_id : this.props.user_id,
                card_position : cardPosition
            }).then((res) => {
                if (!res.data.success) {
                    this.setState({
                        popUpMsg : res.data.err_msg,
                        popUp : true
                    });
                    if (res.data.err_msg === "Room does not exist!") {
                        this.displayInactivityMessage();
                        socket.emit('data-lost', {"game_id" : this.props.game_id});
                    }
                } else {
                    //Remove the card from the hidden hand
                    this.props.updateHiddenHand(this.props.hidden_hand.map((item, index) => {
                        return (index === cardPosition) ? true : item;
                    }));

                    if (!res.data.playable) {
                        this.setState({
                            popUpMsg : "Your card cannot beat the center! Take the cards in the center to end your turn.",
                            popUp : true,
                            haveToTakeCenter : true
                        });
                        this.props.updateMessages([...this.props.messages, {username : "", message : this.props.username + " attempted to play a " + calcCard(res.data.card_reveal) + "!"}]);
                        this.props.updateCenter({
                            deck : this.props.deck,
                            played_pile : [...this.props.played_pile, res.data.card_reveal],
                            discard_pile : this.props.discard_pile
                        });                        
                    } else {
                        this.props.updateMessages([...this.props.messages, {username : "", message : this.props.username + " played a " + calcCard(res.data.card_reveal) + "!"}]);
                        this.props.updateHiddenHand(this.props.hidden_hand.map((item, index) => {return (index === cardPosition) ? true : item}));
                        if (res.data.go_again) {
                            if (res.data.is_burn) { 
                                this.setState({
                                    popUpMsg : "You burned the play pile! You can play another card! Remember to draw a card for every card you play!",
                                    popUp : true
                                });
                                this.props.updateMessages([...this.props.messages, {username : "", message : "The play pile was burned!"}]);
                                this.props.updateCenter({
                                    deck : this.props.deck,
                                    played_pile : [],
                                    discard_pile : [...this.props.discard_pile, ...this.props.played_pile, res.data.card_reveal]
                                });
                            } else {
                                this.setState({
                                    popUpMsg : "You can play another card! Remember to draw a card for every card you play!",
                                    popUp : true
                                });
                                this.props.updateCenter({
                                    deck : this.props.deck,
                                    played_pile : [...this.props.played_pile, res.data.card_reveal],
                                    discard_pile : this.props.discard_pile
                                });
                            }
                            //Update the playable cards because the next card can be anything
                            this.props.updatePlayableCards(DECK_NUM);
                        } else {
                            //If the player doesn't go again, move turn pointer to next player
                            let index = this.props.player_names.indexOf(this.props.username);
                            this.props.updateTurnAt(index === this.props.player_names.length - 1 ? this.props.player_names[0] : this.props.player_names[index + 1]);
                            this.props.updateCenter({
                                deck : this.props.deck,
                                played_pile : [...this.props.played_pile, res.data.card_reveal],
                                discard_pile : this.props.discard_pile
                            });
                        }

                        //Check to see if the player has won
                        if (this.props.hidden_hand.indexOf(false) === -1) {
                            this.displayWinMessage(this.props.username);
                            this.setState({gameEnded : true});
                        }
                    }

                    //Notify other players about your turn
                    socket.emit('play-card', {"game_id" : this.props.game_id, "card" : res.data.card_reveal, "username" : this.props.username, "playable" : res.data.playable, "is_burn" : res.data.is_burn});
                }
            });
        }
    }

    deckClickHandler = () => {
        console.log(this.props);
        if (this.state.drawCardOpps <= 0) {
            this.setState({
                popUpMsg : "You have drawn the maximum possible cards at the current moment.",
                popUp : true
            });
        } else if (this.props.deck <= 0) {
            this.setState({
                popUpMsg : "The deck has no more cards left.",
                popUp : true
            });
        } else {
            axios.put(SERVER('game/' + this.props.game_id + '/drawCard'), {
                user_id : this.props.user_id
            }).then((res) => {
                if (!res.data.success) {
                    this.setState({
                        popUpMsg : res.data.err_msg,
                        popUp : true
                    });
                    if (res.data.err_msg === "Room does not exist!") {
                        this.displayInactivityMessage();
                        socket.emit('data-lost', {"game_id" : this.props.game_id});
                    }
                } else {
                    //Add the drawn card to the player's hand
                    this.props.updateHand([...this.props.hand, res.data.card_drawn]);
                    this.props.updateCenter({
                        deck : this.props.deck - 1,
                        played_pile : this.props.played_pile,
                        discard_pile : this.props.discard_pile
                    });

                    this.setState({drawCardOpps : this.state.drawCardOpps - 1});

                    //Notify the other players about the drawing
                    socket.emit('draw-card', {"game_id" : this.props.game_id, "username" : this.props.username});
                }
            });
        }
    }

    playPileClickHandler = () => {
        this.setState({playSound : false}); //off bc of activity
        let playedCards = this.props.played_pile.map((card) => {
            return (
                <Card float={true} key={card} number={card}/>
            )
        });
        this.setState({
            popUpMsg : (
                <Container>
                    <Row><Col><div className="center-div"><Button className="take-center-btn" onClick={this.takeFromCenterHandler} variant="outline-secondary" size="sm">Take The Center</Button></div></Col></Row>
                    <Row><hr></hr></Row>
                    <Row>{playedCards}</Row>
                </Container>
            ),
            popUp : true
        });
    }

    discardPileClickHandler = () => {
        this.setState({playSound : false}); //off bc of activity
        if (this.props.settings.showDiscard) {
            let discardedCards = this.props.discard_pile.map((card) => {
                return (
                    <Card float={true} key={card} number={card}/>
                )
            });
            this.setState({
                popUpMsg : discardedCards,
                popUp : true
            });
        } else {
            this.setState({
                popUpMsg : "You cannot view the discard pile.",
                popUp : true
            });
        }
    }

    takeFromCenterHandler = () => {
        this.setState({playSound : false}); //off bc of activity
        if (this.state.gameEnded) {
            this.displayGameEndedMessage();
        } else if (!this.state.everyoneSwapped) {
            this.setState({
                popUpMsg : "The swapping phase hasn't ended yet!",
                popUp : true
            });
        } else if (this.props.turn_at !== this.props.username) {
            this.setState({
                popUpMsg : "It's not your turn!",
                popUp : true
            });
        } else {
            this.setState({selectedHandCards : []});
            this.setState({selectedUntouchedCards : []});
            
            if (this.props.settings.playMult) {
                let display = [];
                //Determine if we display the untouched cards in the selection or not
                if (this.props.hand.length > 0 || this.props.deck > 0) {
                    display = ([...this.props.hand, ...this.props.played_pile]).map((card) => {
                        return (<Card highlight={true} clickable={true} float={true} playCard={() => {this.selectCardHandler(card, false)}} fromUntouched={false} key={card} number={card}/>)
                    });
                } else {
                    display = ([...this.props.untouched_hand.filter(card => card !== -1), ...this.props.played_pile]).map((card) => {
                        return (<Card highlight={true} clickable={true} float={true} playCard={() => {this.selectCardHandler(card, false)}} fromUntouched={false} key={card} number={card}/>)
                    });
                }
                this.setState({
                    popUpMsg : (
                        <Container>
                            <Row><Col>
                                <div className="center-div">
                                    Choose the cards you want to leave in the center from your hand, 
                                    the 3 face-up cards on the table (if your hand is empty), or the center pile 
                                    (this will count as a turn). If selecting multiple cards, they must be the same number.
                                </div>
                            </Col></Row>
                            <Row><hr></hr></Row>
                            <Row className="justify-content-md-center">
                                {display.length > 12 ? null : (<Col xs></Col>)}
                                <Col>{display}</Col>
                                {display.length > 12 ? null : (<Col xs></Col>)}
                            </Row>
                            <Row><hr></hr></Row>
                            <Row><Col><div className="center-div"><Button className="play-mult-btn" onClick={() => {this.takeFromCenterHandlerHelper([...this.state.selectedHandCards])}} variant="outline-secondary" size="sm">Leave These Cards</Button></div></Col></Row>
                        </Container>
                    ),
                    popUp : true
                });
            } else {
                let combinedCards = (this.props.hand.length > 0 || this.props.deck > 0) ? [...this.props.hand, ...this.props.played_pile] : 
                                    [...this.props.untouched_hand.filter(card => card !== -1), ...this.props.played_pile];
                let display = combinedCards.map((card) => {
                    return (<Card clickable={true} float={true} playCard={() => {this.takeFromCenterHandlerHelper([card])}} fromUntouched={false} key={card} number={card}/>)
                });
                this.setState({
                    popUpMsg : (
                        <Container>
                            <Row>Choose the card you want to leave in the center from your hand, the 3 face-up cards on the table (if your hand is empty), or the center pile (this will count as a turn).</Row>
                            <Row><hr></hr></Row>
                            <Row>{display}</Row>
                        </Container>
                    ),
                    popUp : true
                });
            }
        }
    }

    takeFromCenterHandlerHelper = (cards) => {

        if (cards.length === 0) {
            return;
        }

        //Since the users are only displayed the cards that they can select, only need to check if they're equal
        let firstCard = cards[0] % 13;
        for (let card of cards) {
            //Check if all the selected cards are the same
            if (card % 13 !== firstCard) {
                this.setState({
                    popUpMsg : "The cards selected are not the same number. Only duplicates can be selected if you want to leave multiple cards in the center.",
                    popUp : true
                });
                return;
            }
        }

        axios.put(SERVER('game/' + this.props.game_id + '/takeFromCenter'), {
            user_id : this.props.user_id,
            chosen_cards : cards
        }).then((res) => {
            if (!res.data.success) {
                this.setState({
                    popUpMsg : res.data.err_msg,
                    popUp : true
                });

                if (res.data.err_msg === "Room does not exist!") {
                    this.displayInactivityMessage();
                    socket.emit('data-lost', {"game_id" : this.props.game_id});
                }
            } else {
                this.setState({
                    popUpMsg : "",
                    popUp : false,
                    haveToTakeCenter : false
                });
                //Transfer the center cards to the player's hands (and remove the chosen card from hand or untouched hand, wherever it is)
                this.props.updateHand([...this.props.hand.filter(item => cards.indexOf(item) === -1), ...this.props.played_pile.filter(item => cards.indexOf(item) === -1)]);
                this.props.updateUntouchedHand(this.props.untouched_hand.map((item) => {return (cards.indexOf(item) !== -1) ? -1 : item}));
                this.props.updateCenter({
                    deck : this.props.deck,
                    played_pile : cards,
                    discard_pile : this.props.discard_pile
                });

                this.props.updateMessages([...this.props.messages, {username : "", message : `${this.props.username} took from the center!`}]);
                //Notify other players of the turn
                socket.emit('take-center', {"game_id" : this.props.game_id, "username" : this.props.username, "is_burn" : res.data.is_burn});

                if (res.data.go_again) {
                    if (res.data.is_burn) { 
                        this.setState({
                            popUpMsg : "You burned the play pile! You can play another card! Remember to draw a card for every card you play!",
                            popUp : true
                        });
                        this.props.updateMessages([...this.props.messages, {username : "", message : "The play pile was burned!"}]);
                        this.props.updateCenter({
                            deck : this.props.deck,
                            played_pile : [],
                            discard_pile : [...this.props.discard_pile, ...this.props.played_pile]
                        });
                    } else {
                        this.setState({
                            popUpMsg : "You can play another card! Remember to draw a card for every card you play!",
                            popUp : true
                        });
                    }
                    //Update the playable cards because the next card can be anything
                    this.props.updatePlayableCards(DECK_NUM);
                } else {
                    //If the player doesn't go again, move turn pointer to next player
                    let index = this.props.player_names.indexOf(this.props.username);
                    this.props.updateTurnAt(index === this.props.player_names.length - 1 ? this.props.player_names[0] : this.props.player_names[index + 1]);
                }

                //Update the card draw opps so the player can draw a card
                if (this.props.hand.length < 4) {
                    this.setState({drawCardOpps : 4 - this.props.hand.length});
                }

                //Autodraw cards for the player if auto draw is turned on
                if (this.props.settings.autoDraw) {
                    let numDraw = Math.min(4 - this.props.hand.length, this.props.deck);
                    for (let i = 0; i < numDraw; i++) {
                        setTimeout(() => {
                            this.deckClickHandler();
                        }, 1200 * i);
                    }
                }
            }
        });
    }
    
    returnHomeHandler = () => {
        if (!this.state.gameEnded) {
            socket.emit('leave-game', {"username" : this.props.username, "game_id" : this.props.game_id});
        }
        socket.emit('disconnect-from-room', {"game_id" : this.props.game_id});
        socket.off();
        this.props.resetState();
        this.props.history.push('/');
    }

    playAgainHandler = () => {
        if (!this.state.gameEnded) {
            this.setState({
                popUpMsg: "The game has not ended yet.",
                popUp: true
            });
            return;
        }
        if (this.state.newGameID === "" && this.props.username === this.props.player_names[0]) {
            this.setState({
                popUpMsg: "Creating a new room now...",
                popUp: true
            });

            //Attempt to create the room
            axios.post(SERVER('room/create'), {
                username : this.props.username
            }).then((res) => {
                console.log(res.data);
                if (!res.data.success) {
                    this.setState({
                        room: "",
                        popUpMsg: res.data.err_msg,
                        popUp: true
                    });       
                } else {
                    //If successful, save all the necessary info
                    this.setState({
                        popUpMsg: "",
                        popUp: false                   
                    });
                    
                    let currentUsername = this.props.username;
                    socket.emit('new-room', {"game_id" : this.props.game_id, "new_game_id" : res.data.room_id});
                    socket.emit('disconnect-from-room', {"game_id" : this.props.game_id});
                    socket.off();

                    this.props.resetState();
                    this.props.updatePlayerNames([currentUsername]);
                    this.props.updateUserID(res.data.user_id);
                    this.props.updateGameID(res.data.room_id);
                    this.props.updateUsername(currentUsername);

                    this.props.history.push('/lobby');
                }
            });
        } else if (this.state.newGameID === "") {
            this.setState({
                popUpMsg: "Waiting on the VIP to create the new game room. You will be automatically redirected to the new room when it's made.",
                popUp: true,
                waitingForNewGame : true
            });
        } else {
            this.setState({
                popUpMsg: "Redirecting to new room...",
                popUp: true
            });
            //Attempt to join the room
            axios.post(SERVER('room/' + this.state.newGameID + '/join'), {
                username : this.props.username
            }).then((res) => {
                if (!res.data.success) {
                    this.setState({
                        room: "",
                        popUpMsg: res.data.err_msg,
                        popUp: true
                    });       
                } else {
                    //If room is found, save the necessary info and redirect player to game lobby
                    this.setState({
                        popUpMsg: "",
                        popUp: false                   
                    });

                    let currentUsername = this.props.username;
                    socket.emit('disconnect-from-room', {"game_id" : this.props.game_id});
                    socket.off();
    
                    this.props.resetState();
                    this.props.updatePlayerNames([...res.data.players_in_room, currentUsername]);
                    this.props.updateUserID(res.data.user_id);
                    this.props.updateGameID(this.state.newGameID);
                    this.props.updateUsername(currentUsername);
    
                    this.props.history.push('/lobby');       
                }  
            });
        }
        
    }

    handleRLDDChange = (newHand) => {
        // this.setState({cards : newItems});
        this.props.updateHand(newHand.map(({card}) => card));
    }

    sortHand = () => {
        this.setState({playSound : false}); //off bc of activity
        let hand = [...this.props.hand];
        //Sorting hand to be numerical order (and K and A at the end)
        hand.sort((a, b) => ((a%13===0||a%13===1)?((a%13)+13):a%13) - ((b%13===0||b%13===1)?((b%13)+13):b%13));
        this.props.updateHand(hand);
    }

    sortNewHand = (newHand) => {
        let hand = [...newHand];
        //Sorting hand to be numerical order (and K and A at the end)
        hand.sort((a, b) => ((a%13===0||a%13===1)?((a%13)+13):a%13) - ((b%13===0||b%13===1)?((b%13)+13):b%13));
        this.props.updateHand(hand);
    }

    checkHandConsistency = (serverHand) => {
        //Check if the current hand is consistent with the server's

        let handSet = new Set();
        let consistent = true;
        for (let num of this.props.hand) {
            handSet.add(num);

            if (!serverHand.includes(num)) {
                consistent = false;
                break;
            }
        }

        //If the hand and server hand is inconsistent with lengths
        if (!consistent || serverHand.length !== handSet.size || handSet.size !== this.props.hand.length) {
            this.setState({
                popUpMsg: "The server detected discrepancies with your cards. Updating hand...",
                popUp: true
            });
            this.props.sortNewHand(serverHand);

            //Update the card draw opps so the player can draw a card
            if (serverHand.length < 4) {
                this.setState({drawCardOpps : 4 - serverHand.length});
            }

            //Autodraw cards for the player if auto draw is turned on
            if (this.props.settings.autoDraw) {
                let numDraw = Math.min(4 - serverHand.length, this.props.deck);
                for (let i = 0; i < numDraw; i++) {
                    setTimeout(() => {
                        this.deckClickHandler();
                    }, 1000 * i);
                }
            }
        }

        console.log("hand is consistent");
    }

    //MESSAGE DISPLAYERS

    displayInactivityMessage = () => {
        this.setState({
            popUpMsg : (
                <Container>
                    <Row><Col><div className="center-div">Game data lost due to inactivity or page refresh.</div></Col></Row>
                    <Row><Col><div className="center-div"><Button className="take-center-btn" onClick={this.returnHomeHandler} variant="secondary" size="sm">Leave Game</Button></div></Col></Row>
                </Container>
            ),
            popUp : true
        });
    }

    displayWinMessage = (winner) => {
        let message;
        if (winner === this.props.username) {
            message = "You have won! Return to the home screen to play another game.";
        } else {
            message = `${winner} has won! Return to the home screen to play another game.`;
        }
        this.setState({
            popUpMsg : (
                <Container>
                    <Row><Col><div className="center-div">{message}</div></Col></Row>
                    <Row><Col>
                        <div className="center-div">
                            <Button className="endgame-btn" onClick={this.returnHomeHandler} variant="secondary" size="sm">Leave Game</Button>
                            <Button className="endgame-btn" onClick={this.playAgainHandler} variant="secondary" size="sm">Play Again</Button>
                        </div>
                    </Col></Row>
                </Container>
            ),
            popUp : true
        });
        this.props.updateMessages([...this.props.messages, {username : "", message : `${winner} has won! Please click the 'Leave Game' button to return to the home screen.`}]);
    }

    displayGameEndedMessage = (winner) => {
        this.setState({
            popUpMsg : (
                <Container>
                    <Row><Col><div className="center-div">The game has ended.</div></Col></Row>
                    <Row><Col>
                        <div className="center-div">
                            <Button className="endgame-btn" onClick={this.returnHomeHandler} variant="secondary" size="sm">Leave Game</Button>
                            <Button className="endgame-btn" onClick={this.playAgainHandler} variant="secondary" size="sm">Play Again</Button>
                        </div>
                    </Col></Row>
                </Container>
            ),
            popUp : true
        });
    }

    displayHelpMessage = () => {
        this.setState({playSound : false}); //off bc of activity
        this.setState({
            popUpMsg : (
                <Container>
                    <Row><Col><div className="center-div"><b>How to play Burn/Idiot</b></div></Col></Row>
                    <Row>
                        <div className="left-div">
                            This game in a way is similar to Deuce (Big 2) where the goal is to try to get rid of 
                            all of your cards. However, in this game there are power cards (2, 3, 7, 10) which can beat 
                            any card and have special effects. This would mean that the lowest card is actually a 4,
                            and the highest card is an Ace (suits do not matter). <br></br><br></br>
                            For the effects of the power cards: <br></br>
                            <ul>
                                <li><b>2</b> - allows you to go again</li>
                                <li><b>3</b> - mirrors the card that's below it (but doesn't mirror the effects of a 2)</li>
                                <li><b>7</b> - forces the next player to play a card that is below 7 (power cards, or 4, 5, 6)</li>
                                <li><b>10</b> - burns the play pile (moves everything to the discard)</li>
                                <li>A <b>four-of-kind</b> on the play pile will also burn the play pile (this includes using 3 as mirrors)</li>
                                <li>Note that playing a card that burns will allow you to play again.</li>
                            </ul>
                            
                            
                            If there is a card you cannot beat in
                            the center, you must take the center cards to end your turn (click the play pile). 
                            Draw a card after every play, and once the deck runs out (including your hand), start 
                            playing the face-up table cards, and then the face-down table cards. In the beginning phase
                            of the game, players are allowed to swap cards in their hand with their cards face-up on the table.
                            Since those face-up cards are going to be played near the end-game, it is in your best interest
                            to swap some decently powerful cards to the table. (Click the cards you want to swap and they will
                            appear blue. Click the swap button once done.)
                            The winner is the one who has no more cards left.
                        </div>
                    </Row>
                    <Row><Col><div className="center-div"><b>Warning</b></div></Col></Row>
                    <Row>
                        <div className="left-div">
                            This game is being timed for inactivity and could possibly delete itself if it's left
                            idle for too long. Note that typing in the chat does not count as activity.
                        </div>
                    </Row>
                </Container>
            ),
            popUp : true
        });
    }

    displayWarningLeaveMessage = () => {
        if (this.state.gameEnded) {
            this.returnHomeHandler();
        } else {
            this.setState({
                popUpMsg : (
                    <Container>
                        <Row><Col><div className="center-div">Leaving the room midgame will cause the game to halt for the other players during your turn.</div></Col></Row>
                        <Row><hr></hr></Row>
                        <Row><Col><div className="center-div"><Button className="take-center-btn" onClick={this.returnHomeHandler} variant="secondary">Leave?</Button></div></Col></Row>
                    </Container>
                ),
                popUp : true
            });
        }
    }

    componentDidMount() {

        if (this.props.game_id) {
            axios.get(SERVER('game/' + this.props.game_id + '/' + this.props.user_id + '/state')).then((res) => {
                    if (!res.data.found) {
                        this.displayInactivityMessage();
                    }
                    this.props.updateGame({
                        players : res.data.other_players,
                        deck : res.data.draw_deck_size,
                        played_pile : res.data.played_pile,
                        discard_pile : res.data.discard_pile,
                        playable_cards : res.data.playable_cards,
                        turn_at : res.data.turn_at
                    });
                }).catch((error) => {
                    this.displayInactivityMessage();
            }); 
        }

        this.setState({
            popUpMsg : "Swapping Phase! Select cards to swap between your hand and the 3 table cards. Click 'Lock In' when finished.",
            popUp : true,
            selectedHandCards : [],
            selectedUntouchedCards : []
        });

        socket.on('player-swap', () => {
            axios.get(SERVER('game/' + this.props.game_id + '/' + this.props.user_id + '/state')).then((res) => {
                if (!res.data.found) {
                    this.displayInactivityMessage();
                }
                this.props.updateGame({
                    players : res.data.other_players,
                    deck : res.data.draw_deck_size,
                    played_pile : res.data.played_pile,
                    discard_pile : res.data.discard_pile,
                    playable_cards : res.data.playable_cards,
                    turn_at : res.data.turn_at
                });
            });
        });

        socket.on('player-ready', ({username}) => {
            axios.get(SERVER('game/' + this.props.game_id + '/' + this.props.user_id + '/state')).then((res) => {
                if (!res.data.found) {
                    this.displayInactivityMessage();
                }
                this.props.updateGame({
                    players : res.data.other_players,
                    deck : res.data.draw_deck_size,
                    played_pile : res.data.played_pile,
                    discard_pile : res.data.discard_pile,
                    playable_cards : res.data.playable_cards,
                    turn_at : res.data.turn_at
                });

                this.makeBeepSound();

                this.props.updateMessages([...this.props.messages, {username : "", message : username + " has locked in their swaps!"}]);

                if (this.props.player_swapped.indexOf(false) === -1) {
                    this.setState({
                        everyoneSwapped : true
                    });
                    this.props.updateMessages([...this.props.messages, {username : "", message : "Everyone is ready. Let the game start!"}]);
                    this.props.updateMessages([...this.props.messages, {username : "", message : "Follow the ☞ emoji next to players' names to see who's turn it is!"}]);
                }
            });
        });

        socket.on('player-played', ({card, username, playable, is_burn}) => {
            axios.get(SERVER('game/' + this.props.game_id + '/' + this.props.user_id + '/state')).then((res) => {
                if (!res.data.found) {
                    this.displayInactivityMessage();
                }
                this.props.updateGame({
                    players : res.data.other_players,
                    deck : res.data.draw_deck_size,
                    played_pile : res.data.played_pile,
                    discard_pile : res.data.discard_pile,
                    playable_cards : res.data.playable_cards,
                    turn_at : res.data.turn_at
                });

                //Check if cards are consistent with the server's
                this.checkHandConsistency(res.data.hand);

                //Make notification sound to signal it's the user's turn
                if (this.props.turn_at === this.props.username) {
                    this.makeBeepSound();
                }

                //Display the card played message to the chat (when implemented)
                if (playable) {
                    this.props.updateMessages([...this.props.messages, {username : "", message : username + " played a " + calcCard(card) + "!"}]);
                } else {
                    this.props.updateMessages([...this.props.messages, {username : "", message : username + " attempted to play a " + calcCard(card) + "!"}]);
                }

                if (is_burn) {
                    //Display the burn message to the chat
                    this.props.updateMessages([...this.props.messages, {username : "", message : "The play pile was burned!"}]);
                }

                if (res.data.is_won) {
                    this.displayWinMessage(res.data.winner);
                    this.setState({gameEnded : true});
                }
            });
        });


        socket.on('player-took-center', ({username, is_burn}) => {
            axios.get(SERVER('game/' + this.props.game_id + '/' + this.props.user_id + '/state')).then((res) => {
                if (!res.data.found) {
                    this.displayInactivityMessage();
                }
                this.props.updateGame({
                    players : res.data.other_players,
                    deck : res.data.draw_deck_size,
                    played_pile : res.data.played_pile,
                    discard_pile : res.data.discard_pile,
                    playable_cards : res.data.playable_cards,
                    turn_at : res.data.turn_at
                });

                //Check if cards are consistent with the server's
                this.checkHandConsistency(res.data.hand);

                //Make notification sound to signal it's the user's turn
                if (this.props.turn_at === this.props.username) {
                    this.makeBeepSound();
                }

                //Display the card played message to the chat (when implemented)
                this.props.updateMessages([...this.props.messages, {username : "", message : `${username} took from the center!`}]);

                if (is_burn) {
                    //Display the burn message to the chat
                    this.props.updateMessages([...this.props.messages, {username : "", message : "The play pile was burned!"}]);
                }               
            });
        });

        socket.on('player-drew-card', ({username}) => {
            axios.get(SERVER('game/' + this.props.game_id + '/' + this.props.user_id + '/state')).then((res) => {
                if (!res.data.found) {
                    this.displayInactivityMessage();
                }
                this.props.updateGame({
                    players : res.data.other_players,
                    deck : res.data.draw_deck_size,
                    played_pile : res.data.played_pile,
                    discard_pile : res.data.discard_pile,
                    playable_cards : res.data.playable_cards,
                    turn_at : res.data.turn_at
                });

            });
        });

        socket.on('player-played-mult', ({cards, username, is_burn}) => {
            axios.get(SERVER('game/' + this.props.game_id + '/' + this.props.user_id + '/state')).then((res) => {
                if (!res.data.found) {
                    this.displayInactivityMessage();
                }
                this.props.updateGame({
                    players : res.data.other_players,
                    deck : res.data.draw_deck_size,
                    played_pile : res.data.played_pile,
                    discard_pile : res.data.discard_pile,
                    playable_cards : res.data.playable_cards,
                    turn_at : res.data.turn_at
                });

                //Check if cards are consistent with the server's
                this.checkHandConsistency(res.data.hand);

                //Make notification sound to signal it's the user's turn
                if (this.props.turn_at === this.props.username) {
                    this.makeBeepSound();
                }

                for (let card of cards) {
                    this.props.updateMessages([...this.props.messages, {username : "", message : username + " played a " + calcCard(card) + "!"}]);
                }

                if (is_burn) {
                    //Display the burn message to the chat
                    this.props.updateMessages([...this.props.messages, {username : "", message : "The play pile was burned!"}]);
                }

                if (res.data.is_won) {
                    this.displayWinMessage(res.data.winner);
                    this.setState({gameEnded : true});
                }

            });
        });

        socket.on('user-pinged', ({username, pinger}) => {
            if (username === this.props.username) {
                this.props.updateMessages([...this.props.messages, {username : "Bell Notif", message : `${pinger} has pinged you!`}]);
                this.makePingSound();
            }
        });

        socket.on('game-data-lost', () => {
            this.displayInactivityMessage();
        });

        socket.on('player-left-game', ({username}) => {
            this.props.updateMessages([...this.props.messages, {username : "", message : `${username} has disconnected from the room. Please leave this room and start a new game.`}]);
        });

        socket.on('created-new-room', ({new_game_id}) => {
            this.setState({newGameID : new_game_id});
            if (this.state.waitingForNewGame) {
                this.setState({
                    popUp : true,
                    popUpMsg : "A new game has been created!"
                });
                setTimeout(() => {
                    this.playAgainHandler();
                }, 1000 * Math.abs(this.props.player_names.indexOf(this.props.username)));
            }
        });

        window.addEventListener("beforeunload", (ev) => {  
            ev.preventDefault();
            return this.returnHomeHandler();
        });

        window.addEventListener('popstate', (ev) => {
            ev.preventDefault();
            return this.returnHomeHandler();
        });
    }

    formatPlayerDisplay = (name, cardDisplay, numCards=null, swapped=null) => {
        let turnPointer = name === this.props.turn_at ? '☞ ' : "";
        if (numCards === null && swapped === null) {
            return (
                <>
                    <p className="player-names"><b>{turnPointer}Your Cards</b></p>
                    {cardDisplay}
                </>
            );
        } 
        return (
            <>
                <p className="player-names"><b>{turnPointer + name} <a style={{"cursor" : "pointer"}} onClick={() => {this.sendPing(name);}}>{" 🔔"}</a>
                {swapped && !this.state.everyoneSwapped ? '✅' : null}<br />Cards In Hand: {numCards} </b></p>
                {cardDisplay}
            </>
        );
    }

    formatCenterDisplay = () => {
        let topPlayed = this.props.played_pile.length === 0 ? 0 : this.props.played_pile[this.props.played_pile.length - 1];
        let topDiscard = this.props.discard_pile.length === 0 ? 0 : this.props.discard_pile[this.props.discard_pile.length - 1];
        return (
            <>
                {!this.props.settings.autoDraw ? 
                    (<Card clickable={true} clickFunct={this.deckClickHandler} float={true} blank={this.props.deck === 0} cardBack={this.props.settings.cardDesign} faceDown={true}/>) :
                    (<Card float={true} blank={this.props.deck === 0} cardBack={this.props.settings.cardDesign} faceDown={true}/>)
                }
                <p>Deck (Cards Left: {this.props.deck}) {this.props.settings.autoDraw ? "(Auto-draw is on)" : "(Click to draw)"}</p>
                <br></br>
                <Card clickable={true} clickFunct={this.playPileClickHandler} float={true} blank={topPlayed === 0} number={topPlayed}/>
                <p>Played Pile (Click to view)</p>
                <br></br>
                <Card clickable={true} clickFunct={this.discardPileClickHandler} float={true} blank={topDiscard === 0} number={topDiscard}/>
                <p>Discard Pile {this.props.settings.showDiscard ? "(Click to view)" : null}</p>
                <br></br>
            </>
        );
    }

    formatChatBoxDisplay = () => {
        return (
            <ChatBox/>
        )
    }

    formatTopButtonDisplays = () => {
        return (
            <>
                <Button className="help-btn" onClick={this.displayHelpMessage} variant="secondary">Help</Button>
                <Button className="help-btn" onClick={this.displayWarningLeaveMessage} variant="secondary">Leave Game</Button>
                {!this.state.gameEnded ? (<Button className="help-btn" onClick={this.toggleSound} variant="secondary">{this.state.muted ? "🔇" : "🔊"}</Button>) : null}
                {this.state.gameEnded ? (<Button className="help-btn" onClick={this.playAgainHandler} variant="secondary">Play Again</Button>) : null}
            </>
        );

    }

    formatCardSideButtonDisplays = () => {
        return (
            <>
                {
                    this.state.swapPhase ? 
                    (<Button className="swap-btn" onClick={this.lockInHandler} variant="secondary">Lock In</Button>):
                    null
                }
                {
                    this.state.swapPhase ? 
                    (<Button className="swap-btn" onClick={this.swapCardHandler} variant="secondary">Swap</Button>):
                    null
                }
                {
                    this.state.swapPhase ? 
                    (<Button className="swap-btn" onClick={this.resetSwapSelectionHandler} variant="secondary">Reset</Button>):
                    null
                }
                {
                    !this.state.swapPhase && this.props.settings.playMult ?
                    (<Button className="swap-btn" onClick={this.multipleCardPlayHandler} variant="secondary">Play Multiple</Button>):
                    null
                }
                {
                    !this.state.swapPhase ?
                    (<Button className="swap-btn" onClick={this.sortHand} variant="secondary">Sort Hand</Button>):
                    null
                }
            </>
        )
    }

    formatPlayerHandDisplay = () => {
        let len = this.props.hand.length;
        const handStyle = {
            "position": "absolute",
            "zIndex": "99",
            "marginLeft": (486 - len * 27) + "px",
            "marginRight": "100px"
        }
        return (
            <div style={handStyle}>
                <RLDD
                    // cssClasses="hand"
                    items={this.props.hand.map((card) => {
                        return {
                            "id" : card,
                            "card" : card
                        }
                    })}
                    itemRenderer={({card, id}) => {
                        return (
                            <div className="item" key={id + " " + this.state.numReset}>
                                <Card highlight={this.state.swapPhase} clickable={true} float={true} playCard={this.cardPlayHandler} fromUntouched={false} number={card}/>
                            </div>
                            
                        );
                    }}
                    onChange={this.handleRLDDChange}
                    layout="horizontal"
                />
            </div>
        )
        
    }

    formatPlayerDisplayLong = () => {
        let hand = this.props.hand.map((card) => {
            return (<Card highlight={this.state.swapPhase} clickable={true} float={true} playCard={this.cardPlayHandler} fromUntouched={false} key={card + " " + this.state.numReset} number={card}/>)
        });

        return hand;
    }

    // SOUND HANDLERS
    toggleSound = () => {
        this.setState({ muted : !this.state.muted });
    }

    sendPing = (username) => {
        socket.emit('ping-user', {"game_id" : this.props.game_id, "username" : username, "pinger" : this.props.username});
    }

    handleSoundPlaying = () => {
        if (!this.state.gameEnded && !this.state.swapPhase && this.props.turn_at !== this.props.username) {
            this.setState({playSound : false});
        }
    }

    formatSound = () => {
        return (
            <>
                <Sound
                    url={(this.state.swapPhase) ? "meep-short.wav" : "meep-long.wav"}
                    playStatus={(this.state.playSound) ? Sound.status.PLAYING : Sound.status.STOPPED}
                    playFromPosition={0 /* in milliseconds */}
                    // onLoading={this.handleSongLoading}
                    onPlaying={this.handleSoundPlaying} 
                    onFinishedPlaying={() => {this.setState({playSound : false})}}
                />
                <Sound
                    url={this.state.ping}
                    playStatus={(this.state.playPingSound) ? Sound.status.PLAYING : Sound.status.STOPPED}
                    // onLoading={this.handleSongLoading}
                    // onPlaying={} 
                    onFinishedPlaying={() => {this.setState({playPingSound : false})}}
                />
            </>
        )
    }

 
    makeBeepSound = () => {
        if (!this.state.muted) {
            this.setState({playSound : true});
        }
    }

    makePingSound = () => {
        if (!this.state.muted && !this.state.playPingSound) {
            this.setState({
                playPingSound : true,
                ping : PINGS[Math.floor(Math.random()*PINGS.length)]
            });
        }
    }

    render() {
        let playerNames;
        let playerNumCards;
        let playerSwapped;
        let playerCards;


        if (this.props.user_id !== "") {
            //Set up the display variables 
            playerNames = this.props.player_names;
            playerNumCards = this.props.player_num_cards;
            playerSwapped = this.props.player_swapped;
            playerCards = this.props.players.map(({untouched_hand, hidden_hand, player}) => {
                if (player === this.props.username) {
                    return (
                        <>
                            <Card highlight={this.state.swapPhase} clickable={true} float={true} playCard={this.cardPlayHandler} fromUntouched={true} blank={this.props.untouched_hand[0] === -1} key={this.props.username + '-untouched0-' + this.props.untouched_hand[0] + this.state.numReset} number={this.props.untouched_hand[0]}/>
                            <Card highlight={this.state.swapPhase} clickable={true} float={true} playCard={this.cardPlayHandler} fromUntouched={true} blank={this.props.untouched_hand[1] === -1} key={this.props.username + '-untouched1-' + this.props.untouched_hand[1] + this.state.numReset} number={this.props.untouched_hand[1]}/>
                            <Card highlight={this.state.swapPhase} clickable={true} float={true} playCard={this.cardPlayHandler} fromUntouched={true} blank={this.props.untouched_hand[2] === -1} key={this.props.username + '-untouched2-' + this.props.untouched_hand[2] + this.state.numReset} number={this.props.untouched_hand[2]}/>
                            <Card clickable={true} clickFunct={() => {this.playHiddenHandler(0)}} float={true} blank={this.props.hidden_hand[0]} cardBack={this.props.settings.cardDesign} faceDown={!this.props.hidden_hand[0]} key={this.props.username + '-hidden0-' + this.props.hidden_hand[0]}/>
                            <Card clickable={true} clickFunct={() => {this.playHiddenHandler(1)}} float={true} blank={this.props.hidden_hand[1]} cardBack={this.props.settings.cardDesign} faceDown={!this.props.hidden_hand[1]} key={this.props.username + '-hidden1-' + this.props.hidden_hand[1]}/>
                            <Card clickable={true} clickFunct={() => {this.playHiddenHandler(2)}} float={true} blank={this.props.hidden_hand[2]} cardBack={this.props.settings.cardDesign} faceDown={!this.props.hidden_hand[2]} key={this.props.username + '-hidden2-' + this.props.hidden_hand[2]}/>
                        </>
                    );
                } else {
                    return (
                        <>
                            <Card float={true} fromUntouched={true} blank={untouched_hand[0] === -1} key={player + '-untouched-0'} number={untouched_hand[0]}/>
                            <Card float={true} fromUntouched={true} blank={untouched_hand[1] === -1} key={player + '-untouched-1'} number={untouched_hand[1]}/>
                            <Card float={true} fromUntouched={true} blank={untouched_hand[2] === -1} key={player + '-untouched-2'} number={untouched_hand[2]}/>
                            <Card float={true} blank={hidden_hand[0]} cardBack={this.props.settings.cardDesign} faceDown={!hidden_hand[0]} key={player + '-hidden-0'}/>
                            <Card float={true} blank={hidden_hand[1]} cardBack={this.props.settings.cardDesign} faceDown={!hidden_hand[1]} key={player + '-hidden-1'}/>
                            <Card float={true} blank={hidden_hand[2]} cardBack={this.props.settings.cardDesign} faceDown={!hidden_hand[2]} key={player + '-hidden-2'}/>
                        </>
                    );
                }
                
            });
            //Look for this player's position in the list
            let playerIndex;
            for (playerIndex = 0; playerIndex < this.props.player_names.length; playerIndex++) {
                if (this.props.player_names[playerIndex] === this.props.username) {
                    break;
                }
            }


            // hand = this.props.hand.map((card) => {
            //     return (<Card highlight={this.state.swapPhase} clickable={true} float={true} playCard={this.cardPlayHandler} fromUntouched={false} key={card + " " + this.state.numReset} number={card}/>)
            // });

            playerNames = [
                ...(playerNames.slice(playerIndex, playerNames.length)),
                ...(playerNames.slice(0, playerIndex))
            ]

            playerNumCards = [
                ...(playerNumCards.slice(playerIndex, playerNumCards.length)),
                ...(playerNumCards.slice(0, playerIndex))
            ]

            playerSwapped = [
                ...(playerSwapped.slice(playerIndex, playerSwapped.length)),
                ...(playerSwapped.slice(0, playerIndex))
            ]

            playerCards = [
                ...(playerCards.slice(playerIndex, playerCards.length)),
                ...(playerCards.slice(0, playerIndex))
            ]
        }

        if (this.props.players.length === 2) {
            return (
                <>
                    {this.formatSound()}
                    <Container className="p-3">
                        <Popup open={this.state.popUp} onClose={this.closePopUp} modal closeOnDocumentClick>
                            <div>{this.state.popUpMsg}</div>
                        </Popup>
                        <Container>
                            <Row><hr></hr></Row>
                            <Row>
                                <Col></Col>
                                <Col>
                                    {this.formatPlayerDisplay(playerNames[1], playerCards[1], playerNumCards[1], playerSwapped[1])}
                                </Col>
                                <Col>{this.formatTopButtonDisplays()}</Col>
                            </Row>
                            <Row><hr></hr></Row>
                            <Row><hr></hr></Row>
                            <Row>
                                <Col>
                                    <hr className="hidden-line"></hr>
                                    <hr className="hidden-line"></hr>
                                    <hr className="hidden-line"></hr>
                                    <hr className="hidden-line"></hr>
                                    <hr className="hidden-line"></hr>
                                    <hr className="hidden-line"></hr>
                                    <hr className="hidden-line"></hr>
                                    <hr className="hidden-line"></hr>
                                    <hr className="hidden-line"></hr>
                                    {this.formatCardSideButtonDisplays()}
                                    <hr className="hidden-line"></hr>
                                    <hr className="hidden-line"></hr>
                                    {this.props.hand.length <= 18 ? this.formatPlayerHandDisplay() : null}
                                </Col>
                                <Col>
                                    <hr className="hidden-line"></hr>
                                    {this.formatCenterDisplay()}
                                    <hr className="hidden-line"></hr>
                                    {this.formatPlayerDisplay(playerNames[0], playerCards[0])}
                                    <hr className="hidden-line"></hr>
                                    <hr className="hidden-line"></hr>
                                    {this.props.hand.length > 18 ? this.formatPlayerDisplayLong() : null}
                                </Col>
                                <Col>
                                    <hr className="hidden-line"></hr>
                                    <hr className="hidden-line"></hr>
                                    {this.formatChatBoxDisplay()}
                                </Col>
                            </Row>
                            <Row>
                                <hr></hr>
                            </Row>
                        </Container>
                    </Container>
                </>
            )
        } else if (this.props.players.length === 3) {
            return (
                <>
                    {this.formatSound()}
                    <Container className="p-3">
                        <Popup open={this.state.popUp} onClose={this.closePopUp} modal closeOnDocumentClick>
                            <div>{this.state.popUpMsg}</div>
                        </Popup>
                        <Container>
                            <Row><hr></hr></Row>
                            <Row>
                                <Col></Col>
                                <Col>
                                    {this.formatPlayerDisplay(playerNames[2], playerCards[2], playerNumCards[2], playerSwapped[2])}
                                </Col>
                                <Col>{this.formatTopButtonDisplays()}</Col>
                            </Row>
                            <Row><hr></hr></Row>
                            <Row><hr></hr></Row>
                            <Row>
                                <Col>
                                    <hr className="hidden-line"></hr>
                                    {this.formatPlayerDisplay(playerNames[1], playerCards[1], playerNumCards[1], playerSwapped[1])}
                                    <hr className="hidden-line"></hr>
                                    {this.formatCardSideButtonDisplays()}
                                    <hr className="hidden-line"></hr>
                                    <hr className="hidden-line"></hr>
                                    {this.props.hand.length <= 18 ? this.formatPlayerHandDisplay() : null}
                                </Col>
                                <Col>
                                    <hr className="hidden-line"></hr>
                                    {this.formatCenterDisplay()}
                                    <hr className="hidden-line"></hr>
                                    {this.formatPlayerDisplay(playerNames[0], playerCards[0])}
                                    <hr className="hidden-line"></hr>
                                    <hr className="hidden-line"></hr>
                                    {this.props.hand.length > 18 ? this.formatPlayerDisplayLong() : null}
                                </Col>
                                <Col>
                                    <hr className="hidden-line"></hr>
                                    <hr className="hidden-line"></hr>
                                    {this.formatChatBoxDisplay()}
                                </Col>
                            </Row>
                            <Row>
                                <hr></hr>
                            </Row>
                        </Container>
                    </Container>
                </>
            )
        } else if (this.props.players.length === 4) {
            return (
                <>
                    {this.formatSound()}
                    <Container className="p-3">
                        <Popup open={this.state.popUp} onClose={this.closePopUp} modal closeOnDocumentClick>
                            <div>{this.state.popUpMsg}</div>
                        </Popup>
                        <Container>
                            <Row><hr></hr></Row>
                            <Row>
                                <Col></Col>
                                <Col>
                                    {this.formatPlayerDisplay(playerNames[2], playerCards[2], playerNumCards[2], playerSwapped[2])}
                                </Col>
                                <Col>{this.formatTopButtonDisplays()}</Col>
                            </Row>
                            <Row><hr></hr></Row>
                            <Row><hr></hr></Row>
                            <Row>
                                <Col>
                                    {this.formatPlayerDisplay(playerNames[1], playerCards[1], playerNumCards[1], playerSwapped[1])}
                                    <hr className="hidden-line"></hr>
                                    <hr className="hidden-line"></hr>
                                    <hr className="hidden-line"></hr>
                                    {this.formatCardSideButtonDisplays()}
                                    <hr className="hidden-line"></hr>
                                    <hr className="hidden-line"></hr>
                                    {this.props.hand.length <= 18 ? this.formatPlayerHandDisplay() : null}
                                </Col>
                                <Col>
                                    <hr className="hidden-line"></hr>
                                    {this.formatCenterDisplay()}
                                    <hr className="hidden-line"></hr>
                                    {this.formatPlayerDisplay(playerNames[0], playerCards[0])}
                                    <hr className="hidden-line"></hr>
                                    <hr className="hidden-line"></hr>
                                    {this.props.hand.length > 18 ? this.formatPlayerDisplayLong() : null}
                                </Col>
                                <Col>
                                    {this.formatPlayerDisplay(playerNames[3], playerCards[3], playerNumCards[3], playerSwapped[3])}
                                    <hr className="hidden-line"></hr>
                                    {this.formatChatBoxDisplay()}
                                </Col>
                            </Row>
                        </Container>
                    </Container>
                </>
            )
        } else {
            
            return (
                <>
                    <hr className="hidden-line"></hr>
                    <hr className="hidden-line"></hr>
                    <hr className="hidden-line"></hr>
                    <Container>
                        <Row><Col><div className="center-div">Game data lost due to inactivity or page refresh.</div></Col></Row>
                        <Row><hr></hr></Row>
                        <Row><Col><div className="center-div"><Button className="take-center-btn" onClick={this.returnHomeHandler} variant="secondary">Return Home</Button></div></Col></Row>
                    </Container>
                    
                </>

                
            )
        }

        
    }
}

//state contains information from the store 
const mapStateToProps = (state, ownProps) => {
    return {
        user_id : state.user_id,
        username : state.username,
        game_id : state.game_id,
        players : state.players,
        player_names : state.player_names,
        player_swapped : state.player_swapped,
        player_num_cards : state.player_num_cards,
        deck : state.deck,
        played_pile : state.played_pile,
        discard_pile : state.discard_pile,
        hand : state.hand,
        untouched_hand : state.untouched_hand,
        hidden_hand : state.hidden_hand,
        playable_cards : state.playable_cards,
        turn_at : state.turn_at,
        messages : state.messages,
        settings : state.settings
    }
}

//dispatchs an action to make a change to the redux store 
//now the props will include the updateState method
const mapDispatchToProps = (dispatch) => {
    return {
        updateState: (gameState) => {dispatch({type: 'UPDATE_STATE', gameState: gameState})},
        updateGame: (gameState) => {dispatch({type: 'UPDATE_GAME', gameState: gameState})},
        updateGameID: (game_id) => {dispatch({type: 'UPDATE_GAME_ID', game_id: game_id})},
        updateUsername: (username) => {dispatch({type: 'UPDATE_USERNAME', username: username})},
        updatePlayerNames: (player_names) => {dispatch({type: 'UPDATE_PLAYER_NAMES', player_names: player_names})},
        updateUserID: (user_id) => {dispatch({type: 'UPDATE_USER_ID', user_id : user_id})},
        updateHand: (hand) => {dispatch({type: 'UPDATE_HAND', hand: hand})},
        updateUntouchedHand: (untouched_hand) => {dispatch({type: 'UPDATE_UNTOUCHED_HAND', untouched_hand: untouched_hand})},
        updateHiddenHand: (hidden_hand) => {dispatch({type: 'UPDATE_HIDDEN_HAND', hidden_hand: hidden_hand})},
        updateCenter: (center_state) => {dispatch({type: 'UPDATE_CENTER', center_state: center_state} )},
        updatePlayableCards: (playable_cards) => {dispatch({type: 'UPDATE_PLAYABLE_CARDS', playable_cards: playable_cards})},
        updateTurnAt: (turn_at) => {dispatch({type: 'UPDATE_TURN_AT', turn_at: turn_at})},
        resetState: () => {dispatch({type: 'RESET_STATE'})},
        updateMessages: (messages) => {dispatch({type: 'UPDATE_MESSAGES', messages: messages})}

    }
}

export default connect(mapStateToProps, mapDispatchToProps)(Game); 