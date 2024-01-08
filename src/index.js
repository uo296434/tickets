import React from 'react';
import ReactDOM from 'react-dom';
import 'bootstrap/dist/css/bootstrap.min.css';
import detectEthereumProvider from "@metamask/detect-provider";
import { Contract, ethers } from "ethers";
import myContractManifest from "./contracts/MyContract.json";
import { useState, useEffect, useRef } from 'react';
import { decodeError } from 'ethers-decode-error'

function App(){
  const myContract = useRef(null);
  const [tikets, setTikets] = useState([]);
  const [newAdminAddress, setNewAdminAddress] = useState('');
  const [contractBalances, setContractBalances] = useState({ realBalance: 0, balanceWei: 0 });
  const [userBalance, setUserBalance] = useState(0);
  const [donationAmount, setDonationAmount] = useState(0);
  const [reservations, setReservations] = useState([]);  
  const [ticketIndex, setTicketIndex] = useState(0);  
  const [newOwnerAddress, setNewOwnerAddress] = useState('');

  useEffect( () => {
    initContracts();         
    updateWalletBalance();
  }, [])

  let initContracts = async () => {
      await configureBlockchain();
      let tiketsFromBlockchain  = await myContract.current?.getTikets();
      if (tiketsFromBlockchain != null)
        setTikets(tiketsFromBlockchain) 
 
      await updateReservations();      
      await updateContractBalances();
      setDonationAmount("0.01");
  }

  let configureBlockchain = async () => {
    try {
      let provider = await detectEthereumProvider();
      if (provider) {
        await provider.request({ method: 'eth_requestAccounts' });
        const networkId = await provider.request({ method: 'net_version' })

        provider = new ethers.providers.Web3Provider(provider);
        const signer = provider.getSigner();

        myContract.current  = new Contract(
          myContractManifest.networks[networkId].address,
          myContractManifest.abi,
          signer
        );
      }
    } catch (error) { }
  }

  let updateContractBalances = async () => {
    try {
      // Obtener los saldos
      const balances = await myContract.current.getContractBalances();

      // Actualizar el estado con los nuevos saldos
      setContractBalances({ realBalance: balances[0].toString(), balanceWei: balances[1].toString() });
    } catch (error){
      alert("Error obtaining contract balances")
    }
  }

  let updateWalletBalance = async () => {
    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const accounts = await provider.listAccounts();

      if (accounts.length > 0) {
          const balance = await provider.getBalance(accounts[0]);
          setUserBalance(balance.toString());
      }
    } catch (error) {
      alert("Error obtaining wallet balance");
    }
  }

  let updateReservations = async () => {
    try {
      let reservationsFromBlockchain = [];
      for (let i = 0; i < 16; i++) {
        const reservation = await myContract.current.getReservation(i);
        reservationsFromBlockchain.push(reservation);
      }
      setReservations(reservationsFromBlockchain);
    } catch (error) {
      alert("Error obtaining contract reservations");
    }
  };

  let clickBookTicket = async (i) => {
    const tx = await myContract.current.bookTicket(i);
    try{
      await tx.wait()
    } catch (error) { 
      if (error.data) { 
        alert(error.data.message) 
      } else {
        const errorDecoded  = decodeError(error)
        alert('Revert reason:', errorDecoded.error)
      }
    }  
    await updateReservations();
    await updateContractBalances();
    await updateWalletBalance(); 
  };

  let clickBuyTiket = async (i) => {
    myContract.current.isTicketAvailable(i).then(
      (result) => { },
      (error) => { if (error.data) { alert(error.data.message) } }
    );

    if (userBalance < ethers.utils.parseEther(donationAmount)) {
      alert("Insufficient balance to buy the ticket.");
      return;
    }

    const tx = await myContract.current.buyTiket(i,  {
      value: ethers.utils.parseEther(donationAmount),
      gasLimit: 6721975,
      gasPrice: 20000000000,
    })     
    try{
      await tx.wait();
    } catch (error) { 
      const errorDecoded  = decodeError(error)
      alert('Revert reason:', errorDecoded.error)
    } 
    
    // Si permite la compra significa que no está reservado o ha caducado la oferta, 
    // por ello se informa y se anula la reserva
    await myContract.current.checkReservationTimeout(i);
    const provider = new ethers.providers.Web3Provider(window.ethereum);
    const { timestamp } = await provider.getBlock(await provider.getBlockNumber());
    const reservation = await myContract.current.getReservation(i);
    if (timestamp - reservation.timestamp > 120 && reservation.timestamp != 0) {
      alert("The reservation for this ticket had expired, so you were able to buy it.");
    }

    await updateContractBalances();
    await updateWalletBalance(); 
    await updateReservations();   

    const tiketsUpdated = await myContract.current.getTikets();
    setTikets(tiketsUpdated);  
  }

  let withdrawBalance = async () => {
    myContract.current.transferbalanceToAdmin().then(
      (result) => { alert("Success") },
      (error) => { if (error.data) { alert(error.data.message) } }
    );
    await updateContractBalances();
    await updateWalletBalance(); 
  }

  let changeAdmin = async () => {
    myContract.current.changeAdmin(newAdminAddress).then(
      (result) => { alert("Success") },
      (error) => { if (error.data) { alert(error.data.message) } }
    ); 
    await updateContractBalances();
    await updateWalletBalance(); 
  }

  let transferTicket = async (i, newOwner) => {
    const tx = await myContract.current.transferTicket(i, newOwner);
    try {
      await tx.wait()
    } catch (error) {
      if (error.data) {
        alert(error.data.message)
      } else {
        const errorDecoded = decodeError(error)
        alert('Revert reason:', errorDecoded.error)
      }
    }

    const tiketsUpdated = await myContract.current.getTikets();
    setTikets(tiketsUpdated);    

    await updateContractBalances();
    await updateWalletBalance(); 
  }

  return (
    <div class="ml-2">
      <h1>Tickets store</h1>
      <button class="btn btn-primary mb-4 mt-3" onClick={() => withdrawBalance()}>Withdraw Balance</button>
      <form onSubmit={(e) => { e.preventDefault(); }}>
        <div class="mb-4">
          <label htmlFor="donationAmount">Amount of BNB to donate:</label>
          <input
            id="donationAmount"
            type="number"
            step="0.01"
            className="ml-2 w-25"
            defaultValue="0.01"
            onChange={(e) => setDonationAmount(e.target.value)}
          />
        </div>
        <ul>
          {tikets.map((address, i) =>
            <li className="mb-2">Ticket {i} bought by {address}   
              {address === ethers.constants.AddressZero && (
                <span>
                  <button className="btn btn-primary ml-2" onClick={() => clickBuyTiket(i)}>
                    Buy
                  </button>
                  {!reservations || !reservations[i] || (reservations[i] && reservations[i].reserver == ethers.constants.AddressZero) && (
                    <button className="btn btn-success ml-2" onClick={() => clickBookTicket(i)}>
                      Reserve
                    </button>
                  )}
                  {reservations && reservations[i] && reservations[i].reserver !== ethers.constants.AddressZero && (
                    <label className="ml-2 text-warning">Reserved</label>
                  )}
                </span>
              )}
            </li>
          )}
        </ul>
      </form>
      <br />
      <form onSubmit={(e) => { e.preventDefault(); transferTicket(ticketIndex, newOwnerAddress); }}>
        <p><b>Transfer a Ticket to another user:</b></p>
        <label htmlFor="ticketIndex">Ticket Index:</label>
        <input
          id="ticketIndex"
          type="number"          
          className="ml-2 w-25"
          placeholder="0"
          onChange={(e) => setTicketIndex(e.target.value)}
        />
        <br />
        <label htmlFor="newOwnerAddress">New owner address:</label>
        <input
          id="newOwnerAddress"
          type="text" 
          className="ml-2 w-50"
          placeholder="0x0000000000000000000000000000000000000000"
          onChange={(e) => setNewOwnerAddress(e.target.value)}
        />
        <button className="btn btn-primary ml-2" type="submit">Transfer Ticket</button>
      </form>
      <br />
      <form onSubmit={(e) => { e.preventDefault(); changeAdmin(); }}>
        <p><b>Change the administrator:</b></p>
        <label htmlFor="newAdminAddress">New admin address:</label>
        <input
          id="newAdminAddress"
          type="text"
          className="ml-2 w-50"
          placeholder="0x0000000000000000000000000000000000000000"
          value={newAdminAddress}
          onChange={(e) => setNewAdminAddress(e.target.value)}
        />
        <button class="btn btn-secondary ml-2" type="submit">Change Admin</button>
      </form>
      <br />
      <div>
        <p>Actual contract balance: {contractBalances.realBalance} wei</p>
        <p>Balance of balanceWei: {contractBalances.balanceWei} wei</p>
        <br />
        <p>User wallet balance: {userBalance} wei</p>
      </div>
    </div>
  )
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);